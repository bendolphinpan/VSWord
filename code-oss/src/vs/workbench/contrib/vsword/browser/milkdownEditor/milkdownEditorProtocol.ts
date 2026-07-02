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

export type WebviewToHostMessage =
	| WebviewReadyMessage
	| WebviewMarkdownUpdatedMessage
	| WebviewSaveRequestMessage
	| WebviewOpenAsTextMessage
	| WebviewErrorMessage;

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

export type HostToWebviewMessage =
	| HostInitMessage
	| HostDirtyChangedMessage
	| HostSavedMessage
	| HostReloadMessage
	| HostErrorMessage;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VSWORD_MILKDOWN_EDITOR_ID = 'vsword.markdown.milkdown';
export const VSWORD_MILKDOWN_ORIGIN = 'vsword-markdown-milkdown';
export const VSWORD_MILKDOWN_WORKING_COPY_TYPE_ID = 'vsword.markdown.milkdown';

/** Debounce for webview→host auto-save while the user types. */
export const VSWORD_MILKDOWN_AUTOSAVE_DEBOUNCE_MS = 700;
