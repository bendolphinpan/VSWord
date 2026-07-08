/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8b.2 · PDF 导出（vsword.export.pdf）
//
// 与 T-3.8b.1 HTML 导出的差异（重要！）：
//   1. imageMode **强制 `data-uri`**（忽略用户配置）—— 打印 dialog 不知道 sibling-folder 是啥
//   2. 目标路径：dev 拍板 `os.tmpdir()`（`IEnvironmentService.tmpDir` 亦可）—— 写完临时 HTML
//      调 `workbench.action.webview.print` / 等价命令触发浏览器 print dialog
//   3. HTML `<head>` 追加 `@page { size: A4; margin: 20mm; }` 打印样式（Q1/PRD §4.2 契约）
//   4. **不 fallback**：若 print 命令不存在或抛错 → warn `PDF export requires webview print support`
//   5. 复用 T-3.8b.1 的 assemble + protocol + pending-map（trackExportRequest / resolveExportResponse）
//
// 运行时 lifecycle：
//   - 临时文件生成 `<tmpDir>/vsword-export-<uuid>.html`
//   - 本卡 P1 窄化：暂不做主动清理（`setTimeout 30s unlink` / lifecycle disposable 拆到 T-3.8b.2.b）
//   - 单测通过依赖注入验证：assemble 参数、writeFile 目标、print 命令派发、失败分支 warn

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { basename, dirname, joinPath } from '../../../../../base/common/resources.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { AssembleExportHtmlInput, AssembleExportHtmlOutput, assembleExportHtml } from './exportHtmlAssemble.js';
import { trackExportRequest } from './exportContribution.js';
import { MilkdownEditorInput } from './milkdownEditorInput.js';
import {
	HostExportHtmlRequestMessage,
	VSWORD_EXPORT_PDF_ACTION_ID,
	WebviewExportHtmlResponseMessage,
} from './milkdownEditorProtocol.js';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const VSWORD_EXPORT_CATEGORY = localize2('vsword.export.category', 'VSWord');

/**
 * PRD §4.2 契约：唯一 v1 print 样式，加进 HTML `<head>`。
 * v1 不写 `@media print`（Phase 3 视觉延后策略）——`@page` 规则本身在打印时生效。
 */
export const VSWORD_EXPORT_PDF_PAGE_CSS = '@page { size: A4; margin: 20mm; }';

/** 尝试触发浏览器 print 的命令 id（若 Code-OSS 内置不存在 → executeCommand reject → warn 分支）。 */
export const VSWORD_WEBVIEW_PRINT_COMMAND_ID = 'workbench.action.webview.print';

// ---------------------------------------------------------------------------
// runPdfExport —— 依赖注入面
// ---------------------------------------------------------------------------

/**
 * runPdfExport 的依赖注入面。Action2.run() 只做「从 accessor 装配依赖 → 调 runPdfExport」。
 * 测试直接构造 fake deps 跑纯函数（对齐 exportContribution.test.ts 模式）。
 */
export interface RunPdfExportDeps {
	/** 当前 active editor 的资源 URI（若非 markdown → no-md 分支 warn）。 */
	readonly activeResource: URI | undefined;
	/** 临时目录基址（`IEnvironmentService.tmpDir` 或 fake）。 */
	readonly tmpDir: URI;
	/** 请求 webview 生成 snapshot（真机版：postMessage export.html.request，测试版：fake resolve）。 */
	readonly requestSnapshot: (title: string) => Promise<WebviewExportHtmlResponseMessage>;
	/** 主 HTML 落盘（临时文件）。 */
	readonly writeFile: (target: URI, buffer: VSBuffer) => Promise<unknown>;
	/**
	 * 触发浏览器 print dialog。真机走 `commandService.executeCommand('workbench.action.webview.print', uri)`；
	 * reject / throw / 未注册命令 → 走 warn 分支（不 fallback，PRD §4.2 契约）。
	 */
	readonly executePrint: (target: URI) => Promise<unknown>;
	/** 可选：注入 assemble，默认走 assembleExportHtml。 */
	readonly assemble?: (input: AssembleExportHtmlInput) => AssembleExportHtmlOutput;
	/** notification 面：info / warn / error。 */
	readonly notify: {
		readonly info: (message: string) => void;
		readonly warn: (message: string) => void;
		readonly error: (message: string) => void;
	};
}

/** runPdfExport 结果（测试断言分支）。 */
export type RunPdfExportResult =
	| { readonly kind: 'printed'; readonly tmpTarget: URI }
	| { readonly kind: 'no-md' }
	| { readonly kind: 'timeout' }
	| { readonly kind: 'error'; readonly message: string }
	| { readonly kind: 'print-unsupported'; readonly message: string };

function isMarkdownResource(resource: URI | undefined): boolean {
	if (!resource) return false;
	const name = basename(resource).toLowerCase();
	return name.endsWith('.md') || name.endsWith('.markdown');
}

/** 从 md URI 派生临时 HTML 目标（tmpDir/vsword-export-<uuid>.html）。 */
function deriveTmpTargetUri(tmpDir: URI, stem: string): URI {
	// stem 可能带非法字符（中文/空格），加 uuid 兜底唯一 —— 打印命令用得到路径即可。
	const safeStem = stem.replace(/[^A-Za-z0-9._\u4e00-\u9fff-]+/g, '-').replace(/^-+|-+$/g, '') || 'doc';
	return joinPath(tmpDir, `vsword-export-${safeStem}-${generateUuid()}.html`);
}

/**
 * host 侧 PDF 导出主流程：
 *  1) 校验 active editor 是 markdown 资源
 *  2) requestSnapshot（imageMode 强制 data-uri）
 *  3) assembleExportHtml（pageCss = `@page { size: A4; margin: 20mm; }`）
 *  4) writeFile 到临时目录
 *  5) executePrint 触发 print dialog；失败 → warn（PDF export requires webview print support），不 fallback
 */
export async function runPdfExport(deps: RunPdfExportDeps): Promise<RunPdfExportResult> {
	if (!isMarkdownResource(deps.activeResource)) {
		deps.notify.warn(
			localize(
				'vsword.export.pdf.requireActive',
				'Export as PDF 需要一个活跃的 Markdown 编辑器（.md / .markdown）。',
			),
		);
		return { kind: 'no-md' };
	}

	const mdUri = deps.activeResource!;
	const stem = basename(mdUri).replace(/\.(md|markdown)$/i, '');

	// 2) 向 webview 索取 snapshot —— 超时 / webview 报错都进入 error 分支
	let response: WebviewExportHtmlResponseMessage;
	try {
		response = await deps.requestSnapshot(stem);
	} catch (err) {
		const raw = err instanceof Error ? err.message : String(err);
		const isTimeout = /timed out/i.test(raw);
		deps.notify.error(
			isTimeout
				? localize('vsword.export.pdf.timeout', 'Export as PDF 超时：webview 未及时响应。')
				: localize('vsword.export.pdf.snapshotFailed', 'Export as PDF 失败：{0}', raw),
		);
		return isTimeout ? { kind: 'timeout' } : { kind: 'error', message: raw };
	}

	if (response.error) {
		deps.notify.error(localize('vsword.export.pdf.webviewError', 'Export as PDF 失败：{0}', response.error));
		return { kind: 'error', message: response.error };
	}

	// 3) assemble —— **imageMode 强制 data-uri**（PRD §4.2 契约），pageCss 注入 @page A4 20mm
	const assemble = deps.assemble ?? assembleExportHtml;
	const out = assemble({
		bodyInnerHtml: response.bodyInnerHtml ?? '',
		themeCss: response.themeCss ?? '',
		prismCss: response.prismCss ?? '',
		themeId: response.themeId ?? 'default',
		title: stem,
		imageMode: 'data-uri',
		imageResources: undefined,
		pageCss: VSWORD_EXPORT_PDF_PAGE_CSS,
	});

	// 4) 写临时 HTML
	const tmpTarget = deriveTmpTargetUri(deps.tmpDir, stem);
	try {
		await deps.writeFile(tmpTarget, VSBuffer.fromString(out.html));
	} catch (err) {
		const raw = err instanceof Error ? err.message : String(err);
		deps.notify.error(localize('vsword.export.pdf.writeFailed', 'Export as PDF 写临时文件失败：{0}', raw));
		return { kind: 'error', message: raw };
	}

	// 5) 触发 print dialog —— 失败不 fallback（PRD §4.2 契约）
	try {
		await deps.executePrint(tmpTarget);
	} catch (err) {
		const raw = err instanceof Error ? err.message : String(err);
		deps.notify.warn(
			localize(
				'vsword.export.pdf.printUnsupported',
				'PDF export requires webview print support（{0}）。',
				raw,
			),
		);
		return { kind: 'print-unsupported', message: raw };
	}

	deps.notify.info(localize('vsword.export.pdf.dispatched', '已发起打印：{0}', basename(tmpTarget)));
	return { kind: 'printed', tmpTarget };
}

// ---------------------------------------------------------------------------
// Action2
// ---------------------------------------------------------------------------

/**
 * `Export as PDF` 命令 —— f1 可见，把当前活跃 Markdown 文档写成临时 HTML 并触发浏览器 print dialog。
 *
 * `workbench.action.webview.print` 在部分 Code-OSS build 里可能未注册；本 Action 用 try/catch
 * 包裹 executeCommand，未注册命令 → executeCommand reject → 走 warn 分支，不 fallback。
 */
export class VswordExportPdfAction extends Action2 {
	static readonly ID = VSWORD_EXPORT_PDF_ACTION_ID;

	constructor() {
		super({
			id: VswordExportPdfAction.ID,
			title: localize2('vsword.export.pdf.title', 'Export as PDF'),
			category: VSWORD_EXPORT_CATEGORY,
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const fileService = accessor.get(IFileService);
		const notificationService = accessor.get(INotificationService);
		const commandService = accessor.get(ICommandService);

		const active = editorService.activeEditor;
		const activeResource = active?.resource;

		// v1 策略：临时 HTML 写到 md 同目录（隐藏名前缀 `.vsword-print-*`），避开 tmpDir
		// 需要跨 browser/native 环境的差异问题。清理挂 T-3.8b.2.b（本卡 P1 窄化不做）。
		const tmpDir = activeResource ? dirname(activeResource) : URI.file('/tmp');

		const requestSnapshot = (title: string): Promise<WebviewExportHtmlResponseMessage> => {
			if (!(active instanceof MilkdownEditorInput)) {
				return Promise.reject(new Error('active editor is not a Milkdown editor'));
			}
			const input = active;
			const { response } = trackExportRequest(requestId => {
				const msg: HostExportHtmlRequestMessage = {
					type: 'export.html.request',
					requestId,
					imageMode: 'data-uri', // PDF 硬编码 data-uri（PRD §4.2）
					title,
				};
				input.webview.postMessage(msg);
			});
			return response;
		};

		await runPdfExport({
			activeResource,
			tmpDir,
			requestSnapshot,
			writeFile: (target, buffer) => fileService.writeFile(target, buffer),
			executePrint: (target) => {
				// executeCommand 返回 Promise<undefined>；未注册命令会 reject。
				// 传 target URI 作为参数（`workbench.action.webview.print` 若接受 resource
				// 会走那个 webview；不接受则忽略参数，走当前 focused webview）。
				return commandService.executeCommand(VSWORD_WEBVIEW_PRINT_COMMAND_ID, target);
			},
			notify: {
				info: (message) => notificationService.notify({ severity: Severity.Info, message }),
				warn: (message) => notificationService.notify({ severity: Severity.Warning, message }),
				error: (message) => notificationService.notify({ severity: Severity.Error, message }),
			},
		});
	}
}

// ---------------------------------------------------------------------------
// 注册（副作用 —— 导入本文件即生效）
// ---------------------------------------------------------------------------

registerAction2(VswordExportPdfAction);
