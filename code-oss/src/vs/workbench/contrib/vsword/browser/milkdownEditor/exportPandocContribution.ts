/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8b.3 · Pandoc 导出接线（docx / epub / latex）
//
// 决策 M-1=C：Pandoc **不内置**，走扩展市场；host 侧只做「探测 + 命令暴露」，具体
// pandoc 调用交给扩展。本文件承担 3 件事：
//   1. workbench contribution：workbench 起来后 idle 阶段跑 detectPandoc，把结果
//      写进 ContextKey `vsword.pandocAvailable`（默认 false）
//   2. 三个 Action2（docx / epub / latex）：precondition 挂上面这个 key，未检测到
//      Pandoc → 命令面板 / 菜单里彻底隐藏
//   3. 每个 Action2 的 run() 只做占位：告诉用户 Pandoc 已就绪但导出通道由扩展提供
//      （真正的 pandoc 调用/参数拼接留给未来 T-3.8b.4 的扩展桥 / 或用户装扩展后触发）
//
// 本卡不改任何 UX：无 notification 弹窗轰炸，无 dialog，仅在用户 f1 执行命令时给一条
// 轻量提示。tsc / 单测走绿即可 push。

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import * as path from '../../../../../base/common/path.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import {
	PandocDetectionResult,
	detectPandoc,
	makeEnvVarProbe,
	makeExtensionProbe,
	makePathProbe,
} from './pandocDetection.js';
import {
	VSWORD_EXPORT_DOCX_ACTION_ID,
	VSWORD_EXPORT_EPUB_ACTION_ID,
	VSWORD_EXPORT_LATEX_ACTION_ID,
	VSWORD_PANDOC_AVAILABLE_CTX_KEY,
} from './milkdownEditorProtocol.js';

// ---------------------------------------------------------------------------
// ContextKey 声明 —— 供 Action2 precondition 与 UI when 表达式共享
// ---------------------------------------------------------------------------

/**
 * host 侧探测到 Pandoc 可用（env var / extension / PATH 三选一）。默认 false，
 * 检测通过 → 三条 pandoc 导出命令自动出现在命令面板。
 */
export const VswordPandocAvailableContext = new RawContextKey<boolean>(
	VSWORD_PANDOC_AVAILABLE_CTX_KEY,
	false,
	{ type: 'boolean', description: 'Pandoc 已在当前环境可用（env / extension / PATH）。' },
);

/** Action2.precondition 用的表达式（可被单测直接消费）。 */
export const PANDOC_AVAILABLE_WHEN = ContextKeyExpr.equals(VSWORD_PANDOC_AVAILABLE_CTX_KEY, true);

// ---------------------------------------------------------------------------
// Contribution —— idle 探测 + ContextKey 写入
// ---------------------------------------------------------------------------

const VSWORD_EXPORT_CATEGORY = localize2('vsword.export.category', 'VSWord');

/** 探测 idle 延迟（workbench 起来后再跑，不阻塞首启）。 */
export const PANDOC_DETECTION_IDLE_DELAY_MS = 500;

/**
 * Workbench 契约：`registerWorkbenchContribution2` 拉起本类；构造函数拿服务、装配
 * probe、schedule 一次 idle detect，把结果写进 ContextKey。
 */
export class VswordPandocDetectionContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'vsword.pandoc.detection';

	private readonly _availableCtx: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this._availableCtx = VswordPandocAvailableContext.bindTo(contextKeyService);

		// 首启 idle 后跑一次；再监听扩展 add/remove 事件重跑（安装 pandoc 扩展后立即生效）。
		const scheduler = this._register(new RunOnceScheduler(() => { void this._runDetection(); }, PANDOC_DETECTION_IDLE_DELAY_MS));
		scheduler.schedule();
		this._register(this.extensionService.onDidChangeExtensions(() => scheduler.schedule()));
	}

	private async _runDetection(): Promise<void> {
		const result = await this._detect();
		this._availableCtx.set(result.available);
	}

	/** 抽出来方便测试也可以直接调（虽然本卡走独立纯函数测试路径）。 */
	async _detect(): Promise<PandocDetectionResult> {
		return detectPandoc({
			probeEnvVar: makeEnvVarProbe(
				(name) => readProcessEnv(name),
				async (absolutePath) => this._fileExists(absolutePath),
			),
			probeExtension: makeExtensionProbe(async (id) => this.extensionService.getExtension(id)),
			probePath: makePathProbe({
				readEnvVar: (name) => readProcessEnv(name),
				fileExists: async (p) => this._fileExists(p),
				pathSep: pathListSep(),
				isWindows: isWindows(),
				joinPath: (dir, name) => path.join(dir, name),
			}),
		});
	}

	private async _fileExists(absolutePath: string): Promise<boolean> {
		try {
			const uri = URI.file(absolutePath);
			return await this.fileService.exists(uri);
		} catch {
			return false;
		}
	}
}

// ---------------------------------------------------------------------------
// 环境探测 helpers —— browser layer 里读 process.env 需要 defensive
// ---------------------------------------------------------------------------

function readProcessEnv(name: string): string | undefined {
	// browser 上 `process` 可能不存在 —— electron renderer 里 process.env 有效，纯浏览器场景无。
	try {
		const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
		return g.process?.env?.[name];
	} catch {
		return undefined;
	}
}

function pathListSep(): string {
	return isWindows() ? ';' : ':';
}

function isWindows(): boolean {
	try {
		const g = globalThis as { process?: { platform?: string } };
		return g.process?.platform === 'win32';
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// 3 · Action2（docx / epub / latex）
// ---------------------------------------------------------------------------

/**
 * 3 条命令共用一个 base 类：precondition 挂 pandocAvailable 表达式，run() 仅弹一条
 * info notification 告知用户「已检测到 Pandoc，具体导出请通过安装的 Pandoc 扩展触发」。
 *
 * 未来 T-3.8b.4 可以在这里接实际的扩展命令（e.g. `executeCommand('pandoc.export', args)`）。
 */
abstract class VswordExportPandocAction extends Action2 {
	protected constructor(
		id: string,
		title: { value: string; original: string },
		protected readonly format: 'docx' | 'epub' | 'latex',
	) {
		super({
			id,
			title,
			category: VSWORD_EXPORT_CATEGORY,
			f1: true,
			precondition: PANDOC_AVAILABLE_WHEN,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);

		const active = editorService.activeEditor;
		const activeResource = active?.resource;
		if (!isMarkdownResource(activeResource)) {
			notificationService.notify({
				severity: Severity.Warning,
				message: localize(
					'vsword.export.pandoc.requireActive',
					'Export via Pandoc 需要一个活跃的 Markdown 编辑器（.md / .markdown）。',
				),
			});
			return;
		}

		// 本卡 v1：占位提示。真正的 pandoc 调用交给扩展或后续 T-3.8b.4 桥接。
		const stem = basename(activeResource!).replace(/\.(md|markdown)$/i, '');
		notificationService.notify({
			severity: Severity.Info,
			message: localize(
				'vsword.export.pandoc.dispatched',
				'检测到 Pandoc；请通过已安装的 Pandoc 扩展把「{0}」导出为 {1}（本卡未接扩展桥）。',
				stem,
				this.format.toUpperCase(),
			),
		});
	}
}

export class VswordExportDocxAction extends VswordExportPandocAction {
	static readonly ID = VSWORD_EXPORT_DOCX_ACTION_ID;
	constructor() {
		super(
			VswordExportDocxAction.ID,
			localize2('vsword.export.docx.title', 'Export as Word (.docx)'),
			'docx',
		);
	}
}

export class VswordExportEpubAction extends VswordExportPandocAction {
	static readonly ID = VSWORD_EXPORT_EPUB_ACTION_ID;
	constructor() {
		super(
			VswordExportEpubAction.ID,
			localize2('vsword.export.epub.title', 'Export as EPUB'),
			'epub',
		);
	}
}

export class VswordExportLatexAction extends VswordExportPandocAction {
	static readonly ID = VSWORD_EXPORT_LATEX_ACTION_ID;
	constructor() {
		super(
			VswordExportLatexAction.ID,
			localize2('vsword.export.latex.title', 'Export as LaTeX (.tex)'),
			'latex',
		);
	}
}

function isMarkdownResource(resource: URI | undefined): boolean {
	if (!resource) return false;
	const name = basename(resource).toLowerCase();
	return name.endsWith('.md') || name.endsWith('.markdown');
}

// ---------------------------------------------------------------------------
// 注册（副作用 —— import 本文件即生效）
// ---------------------------------------------------------------------------

registerAction2(VswordExportDocxAction);
registerAction2(VswordExportEpubAction);
registerAction2(VswordExportLatexAction);
