/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Wire protocol between the Milkdown WYSIWYG webview and the workbench host.
 *
 * Both directions are typed as discriminated unions so the host renderer and
 * the bundled webview script share one contract. Keep this file free of any
 * VS Code / DOM imports — it is imported by the webview build script too.
 */

// ---------------------------------------------------------------------------
// Webview → Host
// ---------------------------------------------------------------------------

export interface WebviewReadyMessage {
	readonly type: 'ready';
}

export interface WebviewMarkdownUpdatedMessage {
	readonly type: 'markdownUpdated';
	readonly markdown: string;
	/** T-3.8.1: blockId 集合（session 内稳定 id），未附则视为整篇 dirty。 */
	readonly dirtyBlocks?: readonly string[];
	/** T-3.8.1: 已 dirty 块对应的最新 markdown 片段。Qd1=a webview 上报。 */
	readonly dirtyBlockContents?: Readonly<Record<string, string>>;
	/** T-3.8.1: sessionEpoch —— 每次 load / sessionReady 后自增，host 用于识别落后的消息。 */
	readonly sessionEpoch?: number;
}

export interface WebviewSaveRequestMessage {
	readonly type: 'save';
	readonly markdown: string;
	readonly requestId?: string;
}

export interface WebviewOpenAsTextMessage {
	readonly type: 'openAsText';
}

export interface WebviewErrorMessage {
	readonly type: 'webviewError';
	readonly prefix?: string;
	readonly message: string;
}

/** T-3.3.2: webview asks the host for the persisted global mode preference. */
export interface WebviewPreferenceRequestMessage {
	readonly type: 'preferenceRequest';
}

/** T-3.3.2 + T-3.10: webview reports the user's latest preference so the host can persist it.
 *  Any field may be omitted — the host only updates the fields that were provided. */
export interface WebviewPreferenceUpdateMessage {
	readonly type: 'preferenceUpdate';
	readonly mode?: VswordMilkdownMode;
	readonly focus?: 'on' | 'off';
	readonly typewriter?: 'on' | 'off';
}

/** T-3.3.1: webview asks the host for the persisted theme (+ current workbench kind). */
export interface WebviewThemeRequestMessage {
	readonly type: 'themeRequest';
}

/** T-3.4: single heading entry reported by the webview outline extractor. */
export interface WebviewHeading {
	readonly id: string;
	readonly text: string;
	readonly level: number;
	readonly pos: number;
}

/** T-3.4: webview pushes the full heading list + active id on every doc/selection change. */
export interface WebviewOutlineChangedMessage {
	readonly type: 'outlineChanged';
	readonly headings: readonly WebviewHeading[];
	readonly activeId: string | null;
}

/**
 * T-3.5.1: webview asks the host to persist a pasted/dropped image to disk.
 * `bytes` is a base64-encoded payload (webview↔host postMessage is JSON only).
 * `requestId` is echoed back so the uploader Promise resolves against the
 * correct pending call when multiple images are dropped at once.
 */
export interface WebviewImageUploadRequestMessage {
	readonly type: 'imageUpload';
	readonly requestId: string;
	readonly bytesBase64: string;
	readonly mime: string;
	readonly suggestedName: string;
}

/** T-3.11.1: user clicked a wiki-link — host resolves + opens (or offers to create). */
export interface WebviewOpenWikilinkMessage {
	readonly type: 'openWikilink';
	readonly target: string;
	readonly alias: string | null;
	/** Ctrl/Cmd-click → open in side group. */
	readonly newSplit: boolean;
}

/** T-3.11.1: webview asks the host to resolve one wiki-link target against the workspace. */
export interface WebviewWikilinkResolveRequestMessage {
	readonly type: 'wikilinkResolveRequest';
	readonly target: string;
}

/** T-3.11.2: webview asks for the full workspace file index (for autocomplete). */
export interface WebviewWikilinkIndexRequestMessage {
	readonly type: 'wikilinkIndexRequest';
}

/** T-3.11.3: webview asks the host for a hover-preview snippet of one wiki-link target. */
export interface WebviewWikilinkPreviewRequestMessage {
	readonly type: 'wikilinkPreviewRequest';
	readonly requestId: number;
	readonly target: string;
}

/** T-3.11.4: webview asks for the inverse reference list of the doc it hosts. */
export interface WebviewWikilinkBacklinksRequestMessage {
	readonly type: 'wikilinkBacklinksRequest';
}

/** T-3.11.4: webview asks the host to open a source doc by workspace-relative path. */
export interface WebviewOpenWikilinkPathMessage {
	readonly type: 'openWikilinkPath';
	readonly path: string;
	readonly newSplit: boolean;
}

// ---------------------------------------------------------------------------
// T-3.8.1 · Round-trip 保真度 —— webview → host
// ---------------------------------------------------------------------------

/** T-3.8.1: 一段原文区间。UTF-16 code unit 半开区间 [from, to)，与 remark position.offset 对齐。 */
export type VswordSrcRange = readonly [from: number, to: number];

/** T-3.8.1: session 内稳定的 block 标识（'b_' + 8 位 base36，冲突时加 '_N' 后缀）。 */
export type VswordBlockId = string;

/**
 * T-3.8.1: webview 首次 parse 完成后，把 range-map 交给 host。host 缓存 sourceText / ranges /
 * interstitial 供后续增量拼接。session 一旦落地即为不可变（sessionEpoch 递增才更新）。
 */
export interface WebviewSessionReadyMessage {
	readonly type: 'sessionReady';
	readonly epoch: number;
	readonly blockOrder: readonly VswordBlockId[];
	/** blockId → [from, to)，UTF-16 code unit 偏移，与 sourceText 对齐。 */
	readonly blockRanges: Readonly<Record<VswordBlockId, VswordSrcRange>>;
	/** blockOrder.length + 1 段；覆盖首、每对相邻块之间、尾的原样区。 */
	readonly interstitial: readonly VswordSrcRange[];
	/** 所有 blockRanges 字符数之和 / sourceText.length。 */
	readonly coverage: number;
	readonly hasBOM: boolean;
	readonly newlineStyle: 'LF' | 'CRLF' | 'CR' | 'mixed' | 'none';
	/** coverage 达阈值且结构自洽 —— 可走增量 save；false 时 host 必须走全文 remark 降级。 */
	readonly safe: boolean;
}

export type WebviewToHostMessage =
	| WebviewReadyMessage
	| WebviewMarkdownUpdatedMessage
	| WebviewSaveRequestMessage
	| WebviewOpenAsTextMessage
	| WebviewErrorMessage
	| WebviewPreferenceRequestMessage
	| WebviewPreferenceUpdateMessage
	| WebviewThemeRequestMessage
	| WebviewOutlineChangedMessage
	| WebviewImageUploadRequestMessage
	| WebviewOpenWikilinkMessage
	| WebviewOpenWikilinkPathMessage
	| WebviewWikilinkResolveRequestMessage
	| WebviewWikilinkIndexRequestMessage
	| WebviewWikilinkPreviewRequestMessage
	| WebviewWikilinkBacklinksRequestMessage
	| WebviewSessionReadyMessage;

// ---------------------------------------------------------------------------
// Host → Webview
// ---------------------------------------------------------------------------

/** Initial document push after the webview signals `ready`. */
export interface HostInitMessage {
	readonly type: 'init';
	readonly resourceUri: string;
	readonly fileName: string;
	readonly markdown: string;
}

/** Host-side dirty flag mirror (drives status pill in the toolbar). */
export interface HostDirtyChangedMessage {
	readonly type: 'dirtyChanged';
	readonly dirty: boolean;
}

/** Ack for an explicit save request from the webview (Ctrl+S / auto). */
export interface HostSavedMessage {
	readonly type: 'saved';
	readonly ok: boolean;
	readonly dirty: boolean;
	readonly requestId?: string;
	readonly message?: string;
}

/** Content replacement pushed by the host (revert, external change reload). */
export interface HostReloadMessage {
	readonly type: 'reload';
	readonly markdown: string;
	readonly reason: 'revert' | 'externalChange' | 'initial';
}

/** Non-fatal host-side error surfaced to the toolbar status pill. */
export interface HostErrorMessage {
	readonly type: 'hostError';
	readonly message: string;
}

/** T-3.3.2 + T-3.10: host replies to a preferenceRequest with all persisted view preferences. */
export interface HostPreferenceResponseMessage {
	readonly type: 'preferenceResponse';
	readonly mode: VswordMilkdownMode;
	readonly focus: 'on' | 'off';
	readonly typewriter: 'on' | 'off';
}

/** T-3.3.1: host pushes the effective theme id whenever it changes (initial + on selection). */
export interface HostThemeChangedMessage {
	readonly type: 'themeChanged';
	readonly theme: string;
}

/** T-3.4: host asks the webview to move the cursor to a ProseMirror doc position. */
export interface HostRevealHeadingMessage {
	readonly type: 'revealHeading';
	readonly pos: number;
}

/** T-3.5.1: host tells the webview the pasted image was persisted; provide the relative path to insert. */
export interface HostImageUploadedMessage {
	readonly type: 'imageUploaded';
	readonly requestId: string;
	readonly relativePath: string;
	readonly alt: string;
}

/** T-3.5.1: host reports why the image save failed; the placeholder gets removed. */
export interface HostImageUploadFailedMessage {
	readonly type: 'imageUploadFailed';
	readonly requestId: string;
	readonly message: string;
}

/** T-3.11.1 — a single wiki-link resolution result. */
export interface WikilinkResolveResult {
	readonly target: string;
	/** 'found' | 'missing' | 'ambiguous' */
	readonly status: 'found' | 'missing' | 'ambiguous';
	/** Present when status='found'. Path is workspace-relative POSIX. */
	readonly file?: { readonly name: string; readonly path: string; readonly dir: string };
}

/** T-3.11.1: batched response to one or more `wikilinkResolveRequest`s. */
export interface HostWikilinkResolveResponseMessage {
	readonly type: 'wikilinkResolveResponse';
	readonly results: readonly WikilinkResolveResult[];
}

/** T-3.11.1: host observed a workspace change — webview should flush its resolve cache. */
export interface HostWorkspaceIndexChangedMessage {
	readonly type: 'workspaceIndexChanged';
}

/** T-3.11.2 — a single indexed markdown file (workspace-relative POSIX). */
export interface WikilinkIndexEntry {
	readonly name: string;
	readonly path: string;
	readonly dir: string;
}

/** T-3.11.2: full workspace file index (for autocomplete). */
export interface HostWikilinkIndexResponseMessage {
	readonly type: 'wikilinkIndexResponse';
	readonly entries: readonly WikilinkIndexEntry[];
}

/** T-3.11.3: host answers one preview request with a snippet (or an error status). */
export interface HostWikilinkPreviewResponseMessage {
	readonly type: 'wikilinkPreviewResponse';
	readonly requestId: number;
	readonly target: string;
	/** 'ok' when snippet is populated; 'missing' or 'error' when not. */
	readonly status: 'ok' | 'missing' | 'error';
	readonly title?: string;
	readonly snippet?: string;
	readonly path?: string;
}

/** T-3.11.4: inverse reference list for the doc the webview owns. */
export interface HostWikilinkBacklinksResponseMessage {
	readonly type: 'wikilinkBacklinksResponse';
	readonly ownPath: string;
	readonly refs: readonly {
		readonly path: string;
		readonly name: string;
		readonly count: number;
	}[];
}

// ---------------------------------------------------------------------------
// T-3.8.1 · Round-trip 保真度 —— host → webview
// ---------------------------------------------------------------------------

/**
 * T-3.8.1 · Qa2=c: 整篇「Format Document」命令。webview 拿到后执行等价 `parse → stringify`
 * 全量替换，回写整篇。触发路径：主机侧命令面板 / 快捷键。
 */
export interface HostFormatDocumentMessage {
	readonly type: 'formatDocument';
}

/**
 * T-3.8.1 · Qa2=c + Qd3=a: 选区「Format Selection」命令。webview 侧按当前选区找出
 * 严格 block 对齐的块集合，只格式化这些块；选区未跨完整块时该命令 no-op。
 */
export interface HostFormatSelectionMessage {
	readonly type: 'formatSelection';
}

export type HostToWebviewMessage =
	| HostInitMessage
	| HostDirtyChangedMessage
	| HostSavedMessage
	| HostReloadMessage
	| HostErrorMessage
	| HostPreferenceResponseMessage
	| HostThemeChangedMessage
	| HostRevealHeadingMessage
	| HostImageUploadedMessage
	| HostImageUploadFailedMessage
	| HostWikilinkResolveResponseMessage
	| HostWorkspaceIndexChangedMessage
	| HostWikilinkIndexResponseMessage
	| HostWikilinkPreviewResponseMessage
	| HostWikilinkBacklinksResponseMessage
	| HostFormatDocumentMessage
	| HostFormatSelectionMessage;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VSWORD_MILKDOWN_EDITOR_ID = 'vsword.markdown.milkdown';
export const VSWORD_MILKDOWN_ORIGIN = 'vsword-markdown-milkdown';
export const VSWORD_MILKDOWN_WORKING_COPY_TYPE_ID = 'vsword.markdown.milkdown';

/** Debounce for webview→host auto-save while the user types. */
export const VSWORD_MILKDOWN_AUTOSAVE_DEBOUNCE_MS = 700;

/** T-3.3.2 three-mode switcher — value literals shared by both sides. */
export type VswordMilkdownMode = 'realtime' | 'reading' | 'source';
export const VSWORD_MILKDOWN_MODES: readonly VswordMilkdownMode[] = ['realtime', 'reading', 'source'];
export const VSWORD_MILKDOWN_DEFAULT_MODE: VswordMilkdownMode = 'realtime';
/** IStorageService key holding the last-selected mode (APPLICATION scope, per Q3=b). */
export const VSWORD_MILKDOWN_MODE_STORAGE_KEY = 'vsword.milkdown.lastMode';
/** T-3.10: focus / typewriter toggle preferences (APPLICATION scope, boolean-as-'on'|'off'). */
export const VSWORD_MILKDOWN_FOCUS_STORAGE_KEY = 'vsword.milkdown.focus';
export const VSWORD_MILKDOWN_TYPEWRITER_STORAGE_KEY = 'vsword.milkdown.typewriter';
