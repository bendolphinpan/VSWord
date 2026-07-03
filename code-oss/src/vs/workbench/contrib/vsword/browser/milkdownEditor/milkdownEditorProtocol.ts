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
	| WebviewWikilinkResolveRequestMessage
	| WebviewWikilinkIndexRequestMessage;

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
	| HostWikilinkIndexResponseMessage;

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
