/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8b.1.c · HTML 导出 · webview 接线补齐
//
// 本卡把 T-3.8b.1.b 里的「stub HTML」升级为完整 request/response 通路：
//   1. Action2 检测 active editor 是 MilkdownEditorInput → 走 SaveAs
//   2. host 侧生成 requestId，postMessage `export.html.request` 到 webview
//   3. token-pending Map + 30s 超时（参考 T-3.5.1 imageStrategy 的 async I/O 模式）
//   4. webview 侧回 `export.html.response`（bodyInnerHtml + themeCss + prismCss + themeId +
//      assets? + 或旧 stub `html`）→ host 侧 `assembleExportHtml` 拼装 → writeFile 主 HTML
//   5. sibling-folder 模式下 assets 数组 → 逐条 writeFile 到 `<stem>_files/`
//   6. notify Info + Reveal in File Explorer action（`revealFileInOS`，失败静默降级）
//
// `runHtmlExport(deps)` 保留纯函数入口（测试注入 fake deps，不跑 kernel）；Action2 只做
// 装配 deps 的胶水层。exportContribution 内部持有一个 module-level pendingExports Map，
// 由 milkdownEditorContribution 在收到 `export.html.response` 时通过
// `resolveExportResponse(msg)` 派发解锁 —— 避免把 pending 状态塞进 workbench 服务层。

import { toAction } from '../../../../../base/common/actions.js';
import { VSBuffer, decodeBase64 } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { basename, dirname, joinPath } from '../../../../../base/common/resources.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileDialogService, ISaveDialogOptions } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { assembleExportHtml, AssembleExportHtmlInput, AssembleExportHtmlOutput, ExportImageResource } from './exportHtmlAssemble.js';
import { MilkdownEditorInput } from './milkdownEditorInput.js';
import {
	HostExportHtmlRequestMessage,
	VSWORD_EXPORT_HTML_ACTION_ID,
	VSWORD_EXPORT_IMAGE_MODE_CONFIG,
	VswordExportImageMode,
	WebviewExportHtmlResponseMessage,
} from './milkdownEditorProtocol.js';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const VSWORD_EXPORT_CATEGORY = localize2('vsword.export.category', 'VSWord');
const DEFAULT_IMAGE_MODE: VswordExportImageMode = 'data-uri';
/** webview 侧生成 snapshot 的超时阈值。首帧渲染 + 主题 CSS 收集通常 <100ms，30s 是保守值。 */
export const VSWORD_EXPORT_HTML_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// pendingExports — token-pending Map（module-level singleton）
// ---------------------------------------------------------------------------
//
// milkdownEditorContribution 的 handleWebviewMessage 收到 `export.html.response` 时
// 调 `resolveExportResponse(msg)`，本模块查表 → resolve 对应 Promise。
// runHtmlExport 通过 deps.requestSnapshot 拿到 Promise 后 await 结果。

type PendingEntry = {
	readonly resolve: (msg: WebviewExportHtmlResponseMessage) => void;
	readonly reject: (err: Error) => void;
	readonly timer: ReturnType<typeof setTimeout>;
};

const pendingExports = new Map<string, PendingEntry>();

/**
 * 把一个新的 pending 请求挂到 Map 上。返回既是 requestId 又能被 caller await 的 Promise。
 * `sendRequest(requestId)` 由 caller 实现（真机版就是 `input.webview.postMessage(...)`）。
 */
export function trackExportRequest(
	sendRequest: (requestId: string) => void,
	timeoutMs: number = VSWORD_EXPORT_HTML_TIMEOUT_MS,
): { readonly requestId: string; readonly response: Promise<WebviewExportHtmlResponseMessage> } {
	const requestId = generateUuid();
	const response = new Promise<WebviewExportHtmlResponseMessage>((resolve, reject) => {
		const timer = setTimeout(() => {
			pendingExports.delete(requestId);
			reject(new Error(`Export as HTML timed out after ${timeoutMs}ms`));
		}, timeoutMs);
		pendingExports.set(requestId, { resolve, reject, timer });
	});
	try {
		sendRequest(requestId);
	} catch (err) {
		const entry = pendingExports.get(requestId);
		if (entry) {
			clearTimeout(entry.timer);
			pendingExports.delete(requestId);
			entry.reject(err instanceof Error ? err : new Error(String(err)));
		}
	}
	return { requestId, response };
}

/**
 * milkdownEditorContribution 在消息路由里调这个 —— 把 webview 侧返回的 response 派发
 * 到挂在 pendingExports 里的 Promise。未知 requestId 静默丢弃（可能是超时后才回来）。
 */
export function resolveExportResponse(msg: WebviewExportHtmlResponseMessage): void {
	if (!msg || typeof msg.requestId !== 'string') return;
	const entry = pendingExports.get(msg.requestId);
	if (!entry) return;
	clearTimeout(entry.timer);
	pendingExports.delete(msg.requestId);
	entry.resolve(msg);
}

// ---------------------------------------------------------------------------
// runHtmlExport —— 纯（依赖注入）业务函数
// ---------------------------------------------------------------------------

/**
 * runHtmlExport 的依赖注入面。Action2.run() 只做「从 accessor 装配依赖 → 调 runHtmlExport」。
 * 测试直接构造 fake deps 跑 runHtmlExport，不需要跑完整 VS Code kernel
 * （对齐 vswordViewModeActions.test.ts 模式）。
 */
export interface RunHtmlExportDeps {
	/** 当前 active editor 的资源 URI（若无 active editor 则 undefined）。 */
	readonly activeResource: URI | undefined;
	/** 图片打包策略 —— data-uri / sibling-folder。 */
	readonly imageMode: VswordExportImageMode;
	/** 当前主题 id（写入 `<body data-theme=...>`，未知 → 'default'）。测试可注入 fake，运行时由 Action2 从 webview response 拿。 */
	readonly themeId?: string;
	/** SaveAs 对话框；用户取消返回 undefined。 */
	readonly showSaveDialog: (options: ISaveDialogOptions) => Promise<URI | undefined>;
	/** 主 HTML / assets 落盘。 */
	readonly writeFile: (target: URI, buffer: VSBuffer) => Promise<unknown>;
	/**
	 * 请求 webview 生成 snapshot。返回 webview 侧收集到的 body innerHTML + 主题 CSS + assets。
	 * 真机版：`trackExportRequest(id => input.webview.postMessage(...))`，
	 * 测试版：直接 resolve fake response（或抛超时错模拟异常）。
	 */
	readonly requestSnapshot: (imageMode: VswordExportImageMode, title: string) => Promise<WebviewExportHtmlResponseMessage>;
	/** 可选：注入 assemble 实现，默认走本模块导入的 assembleExportHtml。测试用 spy 时可覆盖。 */
	readonly assemble?: (input: AssembleExportHtmlInput) => AssembleExportHtmlOutput;
	/** 可选：Reveal action 回调；未提供 → notification 不带 action。 */
	readonly reveal?: (target: URI) => void;
	/** notification 面：info / warn / error 三档。 */
	readonly notify: {
		readonly info: (message: string, actions?: ReadonlyArray<{ label: string; run: () => void }>) => void;
		readonly warn: (message: string) => void;
		readonly error: (message: string) => void;
	};
}

/** runHtmlExport 的结果，测试用于断言分支。 */
export type RunHtmlExportResult =
	| { readonly kind: 'wrote'; readonly target: URI; readonly assetCount: number }
	| { readonly kind: 'cancelled' }
	| { readonly kind: 'no-md' }
	| { readonly kind: 'timeout' }
	| { readonly kind: 'error'; readonly message: string };

/**
 * 是否 markdown 资源。走文件扩展名，与 vsword 其它地方口径一致（`.md` / `.markdown`）。
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

/**
 * host 侧 HTML 导出主流程：
 *  1) 校验 active editor 是 markdown 资源，否则 warn + no-md 分支返回
 *  2) SaveAs 弹窗（用户取消 → cancelled 分支静默返回）
 *  3) requestSnapshot 向 webview 拿回 body + themeCss + prismCss + assets（超时 → error 分支）
 *  4) assembleExportHtml 拼装完整 HTML → writeFile 主 HTML
 *  5) sibling-folder 模式下 assets 数组 → 逐条 writeFile 到 `<stem>_files/`
 *  6) info notification + Reveal action
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

	const stem = basename(target).replace(/\.html?$/i, '');

	// 3) 向 webview 索取 snapshot —— 超时 / webview 报错都进入 error 分支
	let response: WebviewExportHtmlResponseMessage;
	try {
		response = await deps.requestSnapshot(deps.imageMode, stem);
	} catch (err) {
		const raw = err instanceof Error ? err.message : String(err);
		const isTimeout = /timed out/i.test(raw);
		deps.notify.error(
			isTimeout
				? localize('vsword.export.html.timeout', 'Export as HTML 超时：webview 未在 {0}ms 内响应。', VSWORD_EXPORT_HTML_TIMEOUT_MS)
				: localize('vsword.export.html.snapshotFailed', 'Export as HTML 失败：{0}', raw),
		);
		return isTimeout ? { kind: 'timeout' } : { kind: 'error', message: raw };
	}

	if (response.error) {
		deps.notify.error(localize('vsword.export.html.webviewError', 'Export as HTML 失败：{0}', response.error));
		return { kind: 'error', message: response.error };
	}

	// 4) 装配最终 HTML —— 兼容旧 stub：webview 回 `html` 字段则直接透传
	let finalHtml: string;
	let assets: ReadonlyArray<{ readonly relativePath: string; readonly base64: string }>;
	if (typeof response.html === 'string' && response.html.length > 0) {
		// 旧协议 / stub：webview 已经自己组装好完整文档
		finalHtml = response.html;
		assets = response.assets ?? [];
	} else {
		const assemble = deps.assemble ?? assembleExportHtml;
		// webview 侧本卡不做本地图片抓取（TODO T-3.8b.1.d），imageResources 恒为空 map。
		const imageResources: ReadonlyMap<string, ExportImageResource> | undefined = undefined;
		const out = assemble({
			bodyInnerHtml: response.bodyInnerHtml ?? '',
			themeCss: response.themeCss ?? '',
			prismCss: response.prismCss ?? '',
			themeId: response.themeId ?? deps.themeId ?? 'default',
			title: stem,
			imageMode: deps.imageMode,
			imageResources,
		});
		finalHtml = out.html;
		// webview 侧本卡传的 assets（若有）优先于 assemble 生成的（本卡 assemble 也不会产出，因为 imageResources 空）。
		assets = response.assets ?? out.assets ?? [];
	}

	// 4a) 写主 HTML
	await deps.writeFile(target, VSBuffer.fromString(finalHtml));

	// 5) sibling-folder 模式：assets 数组逐条写盘（本卡 assets 通常为空，通路先跑通）
	if (deps.imageMode === 'sibling-folder' && assets.length > 0) {
		const targetDir = dirname(target);
		const targetName = basename(target).replace(/\.html?$/i, '');
		const assetsDir = joinPath(targetDir, `${targetName}_files`);
		for (const asset of assets) {
			const assetUri = joinPath(assetsDir, asset.relativePath);
			try {
				await deps.writeFile(assetUri, decodeBase64(asset.base64));
			} catch (err) {
				// 单个 asset 失败不阻止主 HTML 已成功；记 warn 让用户知道
				deps.notify.warn(
					localize(
						'vsword.export.html.assetFailed',
						'导出 asset 失败：{0}（{1}）',
						asset.relativePath,
						err instanceof Error ? err.message : String(err),
					),
				);
			}
		}
	}

	// 6) info + reveal
	const revealAction = deps.reveal
		? [{
			label: localize('vsword.export.html.revealAction', 'Reveal in File Explorer'),
			run: () => {
				try { deps.reveal!(target); } catch { /* 静默降级：Reveal 不可用（e.g. web 环境） */ }
			},
		}]
		: undefined;
	deps.notify.info(
		localize('vsword.export.html.done', '已导出：{0}', basename(target)),
		revealAction,
	);

	return { kind: 'wrote', target, assetCount: assets.length };
}

// ---------------------------------------------------------------------------
// Action2
// ---------------------------------------------------------------------------

/**
 * `Export as HTML` 命令 —— f1 可见，把当前活跃的 Markdown 编辑器导出为 HTML 文件。
 *
 * 本卡不加 precondition：`vsword.milkdown.ready` ContextKey 未注册（kanban body §无越权 允许）。
 * 命令内部通过 `IEditorService.activeEditor` 手动过滤非 MilkdownEditorInput / 非 markdown 资源。
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
		const commandService = accessor.get(ICommandService);

		const active = editorService.activeEditor;
		const activeResource = active?.resource;
		const rawMode = configurationService.getValue<string>(VSWORD_EXPORT_IMAGE_MODE_CONFIG);
		const imageMode: VswordExportImageMode = rawMode === 'sibling-folder' ? 'sibling-folder' : DEFAULT_IMAGE_MODE;

		// requestSnapshot 真机接线：只有 active editor 是 MilkdownEditorInput 时能拿到 webview。
		// 非 milkdown active editor（e.g. 用户在 Monaco 里打开 .md 后跑命令）→ 走
		// no-webview 分支：postMessage 无处发，直接 reject Promise，走 error 分支。
		const requestSnapshot = (mode: VswordExportImageMode, title: string): Promise<WebviewExportHtmlResponseMessage> => {
			if (!(active instanceof MilkdownEditorInput)) {
				return Promise.reject(new Error('active editor is not a Milkdown editor'));
			}
			const input = active;
			const { response } = trackExportRequest(requestId => {
				const msg: HostExportHtmlRequestMessage = { type: 'export.html.request', requestId, imageMode: mode, title };
				input.webview.postMessage(msg);
			});
			return response;
		};

		await runHtmlExport({
			activeResource,
			imageMode,
			showSaveDialog: (options) => fileDialogService.showSaveDialog(options),
			writeFile: (target, buffer) => fileService.writeFile(target, buffer),
			requestSnapshot,
			reveal: (target) => {
				// revealFileInOS 是 Code-OSS 内置命令；web 环境下不存在时 executeCommand 会 reject，
				// 我们在 runHtmlExport 里已用 try/catch 包裹 reveal 调用兜底。
				void commandService.executeCommand('revealFileInOS', target);
			},
			notify: {
				info: (message, actions) => notificationService.notify({
					severity: Severity.Info,
					message,
					actions: actions && actions.length > 0 ? {
						primary: actions.map(a => toAction({
							id: 'vsword.export.html.reveal',
							label: a.label,
							run: () => { a.run(); },
						})),
					} : undefined,
				}),
				warn: (message) => notificationService.notify({ severity: Severity.Warning, message }),
				error: (message) => notificationService.notify({ severity: Severity.Error, message }),
			},
		});
	}
}

// ---------------------------------------------------------------------------
// 注册（副作用 —— 导入本文件即生效）
// ---------------------------------------------------------------------------

registerAction2(VswordExportHtmlAction);
