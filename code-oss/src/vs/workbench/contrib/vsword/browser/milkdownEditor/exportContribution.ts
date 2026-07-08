/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8b.1.b · HTML 导出接线（host 侧 · 窄化版）
//
// 本卡范围（严格按 kanban comment §「实际交付面」）：
//   1. 注册 Action2 `vsword.export.html`（title `Export as HTML` · category `VSWord` · f1 true）
//   2. host 侧 SaveAs + writeFile 主 HTML 走通（webview 接线延后到 T-3.8b.1.c）
//   3. 单测覆盖 host 侧接线（把命令逻辑拆成 `runHtmlExport(deps)` 纯函数，测试注入 mock）
//
// **不接** webview 侧任何代码；**不接** `assembleExportHtml`；**不处理** asset 数组 /
// sibling-folder 模式 / 图片 resolver / Reveal action / precondition context key。
// 落盘的 HTML 是 stub 占位符（`<!DOCTYPE html>...` + `Export placeholder for ${basename}`），
// 便于 T-3.8b.1.c 接入 webview response 后替换。

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { basename, dirname, joinPath } from '../../../../../base/common/resources.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileDialogService, ISaveDialogOptions } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import {
	VSWORD_EXPORT_HTML_ACTION_ID,
	VSWORD_EXPORT_IMAGE_MODE_CONFIG,
	VswordExportImageMode,
} from './milkdownEditorProtocol.js';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const VSWORD_EXPORT_CATEGORY = localize2('vsword.export.category', 'VSWord');
const DEFAULT_IMAGE_MODE: VswordExportImageMode = 'data-uri';

// ---------------------------------------------------------------------------
// runHtmlExport —— 纯（依赖注入）业务函数
// ---------------------------------------------------------------------------

/**
 * runHtmlExport 的依赖注入面。
 *
 * Action2.run() 只做「从 accessor 装配依赖 → 调 runHtmlExport」。测试直接构造 fake deps
 * 跑 runHtmlExport，不需要跑完整 VS Code kernel（对齐 vswordViewModeActions.test.ts 模式）。
 */
export interface RunHtmlExportDeps {
	/** 当前 active editor 的资源 URI（若无 active editor 则 undefined）。 */
	readonly activeResource: URI | undefined;
	/** 图片打包策略（配置读到，交给 T-3.8b.1.c 的 webview handler；本卡仅透传占位）。 */
	readonly imageMode: VswordExportImageMode;
	/** SaveAs 对话框；用户取消返回 undefined。 */
	readonly showSaveDialog: (options: ISaveDialogOptions) => Promise<URI | undefined>;
	/** 主 HTML 落盘。 */
	readonly writeFile: (target: URI, buffer: VSBuffer) => Promise<unknown>;
	/** notification 面：只用 info / warn。 */
	readonly notify: {
		readonly info: (message: string) => void;
		readonly warn: (message: string) => void;
	};
}

/** runHtmlExport 的结果，测试用于断言分支。 */
export type RunHtmlExportResult =
	| { readonly kind: 'wrote'; readonly target: URI }
	| { readonly kind: 'cancelled' }
	| { readonly kind: 'no-md' };

/**
 * 是否 markdown 资源。走文件扩展名，与 vsword 其它地方口径一致
 * （`.md` / `.markdown`）。
 */
function isMarkdownResource(resource: URI | undefined): boolean {
	if (!resource) {
		return false;
	}
	const name = basename(resource).toLowerCase();
	return name.endsWith('.md') || name.endsWith('.markdown');
}

/** 从 md URI 派生默认 .html URI（同目录，同 stem）。 */
function deriveDefaultTargetUri(mdUri: URI): URI {
	const name = basename(mdUri);
	const stem = name.replace(/\.(md|markdown)$/i, '');
	return joinPath(dirname(mdUri), `${stem}.html`);
}

/** 占位 HTML 内容 —— T-3.8b.1.c 接 webview response 后替换成 assembleExportHtml 输出。 */
function buildPlaceholderHtml(stem: string): string {
	const safeStem = stem.replace(/[<>&"']/g, (ch) => {
		switch (ch) {
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '&': return '&amp;';
			case '"': return '&quot;';
			case '\'': return '&#39;';
			default: return ch;
		}
	});
	// TODO(T-3.8b.1.c): 换成 webview 回传 + assembleExportHtml 生成的完整文档。
	return `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"><title>${safeStem}</title></head>\n<body><p>Export placeholder for ${safeStem}</p></body>\n</html>\n`;
}

/**
 * host 侧 HTML 导出主流程（本卡窄化版本）：
 *  1) 校验 active editor 是 markdown 资源，否则 warn + no-md 分支返回
 *  2) SaveAs 弹窗（用户取消 → cancelled 分支静默返回）
 *  3) 写占位 HTML → info notification + wrote 分支返回
 *
 * 图片模式配置读到后当前仅透传占位（本卡不做 asset 落盘）。
 */
export async function runHtmlExport(deps: RunHtmlExportDeps): Promise<RunHtmlExportResult> {
	if (!isMarkdownResource(deps.activeResource)) {
		deps.notify.warn(
			localize(
				'vsword.export.html.requireActive',
				'Export as HTML 需要一个活跃的 Markdown 编辑器（.md / .markdown）。',
			),
		);
		return { kind: 'no-md' };
	}

	const mdUri = deps.activeResource!;
	const defaultUri = deriveDefaultTargetUri(mdUri);

	const target = await deps.showSaveDialog({
		title: localize('vsword.export.html.saveDialogTitle', '导出为 HTML'),
		defaultUri,
		filters: [{ name: 'HTML', extensions: ['html'] }],
	});

	if (!target) {
		return { kind: 'cancelled' };
	}

	// 读一下 imageMode 只是为了证明配置接线可读 —— 当前 body 不用它，T-3.8b.1.c 接 webview 时启用。
	void deps.imageMode;

	const stem = basename(target).replace(/\.html?$/i, '');
	const html = buildPlaceholderHtml(stem);
	await deps.writeFile(target, VSBuffer.fromString(html));

	deps.notify.info(
		localize(
			'vsword.export.html.done',
			'已导出：{0}',
			basename(target),
		),
	);

	return { kind: 'wrote', target };
}

// ---------------------------------------------------------------------------
// Action2
// ---------------------------------------------------------------------------

/**
 * `Export as HTML` 命令 —— f1 可见，把当前活跃的 Markdown 编辑器导出为 HTML 文件。
 *
 * 本卡不加 precondition：`vsword.milkdown.ready` ContextKey 未注册（kanban body §无越权 允许）。
 * 命令内部通过 `IEditorService.activeEditor.resource` 手动过滤非 markdown 资源。
 */
export class VswordExportHtmlAction extends Action2 {
	static readonly ID = VSWORD_EXPORT_HTML_ACTION_ID;

	constructor() {
		super({
			id: VswordExportHtmlAction.ID,
			title: localize2('vsword.export.html.title', 'Export as HTML'),
			category: VSWORD_EXPORT_CATEGORY,
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const fileDialogService = accessor.get(IFileDialogService);
		const fileService = accessor.get(IFileService);
		const configurationService = accessor.get(IConfigurationService);
		const notificationService = accessor.get(INotificationService);

		const activeResource = editorService.activeEditor?.resource;
		const rawMode = configurationService.getValue<string>(VSWORD_EXPORT_IMAGE_MODE_CONFIG);
		const imageMode: VswordExportImageMode = rawMode === 'sibling-folder' ? 'sibling-folder' : DEFAULT_IMAGE_MODE;

		await runHtmlExport({
			activeResource,
			imageMode,
			showSaveDialog: (options) => fileDialogService.showSaveDialog(options),
			writeFile: (target, buffer) => fileService.writeFile(target, buffer),
			notify: {
				info: (message: string) => notificationService.notify({ severity: Severity.Info, message }),
				warn: (message: string) => notificationService.notify({ severity: Severity.Warning, message }),
			},
		});
	}
}

// ---------------------------------------------------------------------------
// 注册（副作用 —— 导入本文件即生效）
// ---------------------------------------------------------------------------

registerAction2(VswordExportHtmlAction);
