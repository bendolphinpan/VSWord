// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown webview entry.
 *
 *  This file is bundled by build-milkdown-editor.cjs into vendor/index.js and loaded
 *  inside the CustomEditor webview. It is NOT part of the Code OSS TypeScript project —
 *  it is copied verbatim into the .tmp builder dir where Milkdown packages are installed.
 *
 *  Kept as plain JS (with @ts-nocheck) so the workspace TS build ignores it, while giving
 *  us syntax highlighting and easy edits instead of the previous embedded string literal.
 *--------------------------------------------------------------------------------------------*/

import {
	Editor,
	defaultValueCtx,
	rootCtx,
	serializerCtx,
	editorViewCtx,
	parserCtx,
	remarkStringifyOptionsCtx,
} from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm, columnResizingPlugin } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { prism } from '@milkdown/plugin-prism';
import { math } from '@milkdown/plugin-math';
import { slash, attachSlashMenu } from './slash-menu.mjs';
import { highlightPlugins } from './highlight.mjs';
import { underlinePlugins } from './underline.mjs';
import { typoraShortcutPlugins } from './shortcuts.mjs';
import { inputRulePlugins } from './input-rules.mjs';
import { focusModePlugins } from './focus-mode.mjs';
import { createModeController } from './mode-controller.mjs';
import { extractHeadings, findEnclosingHeadingId } from './outline-extractor.mjs';
import { configureImageUpload, imageUploadPlugins, installImageUploadMessageBridge } from './image-upload.mjs';
import { imageResizePlugins } from './image-node-view.mjs';
import { remarkLiftImgHtmlPlugin } from './image-schema-override.mjs';
import { tableChromeView } from './table-chrome.mjs';
import { codeBlockChromePlugins, configureCodeBlockCtx } from './code-block-chrome.mjs';
import { blockHandlePlugins, configureBlockHandle, installBlockHandle } from './block-handle.mjs';
import { mathViewPlugins, configureMathKatex } from './math-view.mjs';
import { wikilinkPlugins, configureWikilinkHost, ingestResolutions, invalidateWikilinkCache } from './wikilink.mjs';

// ---- T-3.3.6: Typora-flavoured remark-stringify options ------------------------------------
// Match Typora's default output style so opening a Typora .md and re-saving through VSWord
// produces a minimal diff (dash bullets, single asterisks for em, double for strong, no
// pipe-aligned tables, ATX headings, backtick fences, one-space list indent).
const TYPORA_STRINGIFY_OPTIONS = {
	bullet: '-',
	bulletOrdered: '.',
	emphasis: '*',
	strong: '*',           // 2× applied → **strong**
	fences: true,          // ``` fences instead of indented code
	listItemIndent: 'one', // Typora uses 1-space indent for list items
	rule: '-',             // --- thematic breaks
	ruleRepetition: 3,
	ruleSpaces: false,
	tightDefinitions: true,
	resourceLink: false,
	setext: false,         // ATX headings (# H1) not underline
	incrementListMarker: true,
};

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
// T-3.5.1: wire the imageUpload* host messages into the pending uploader registry BEFORE
// the editor is created so no message arrives ahead of the listener.
installImageUploadMessageBridge();
const shell = document.querySelector('.vsword-md-shell');
const root = document.getElementById('milkdown-root');
const status = document.getElementById('milkdown-status');
const saveButton = document.getElementById('milkdown-save');
const sourceTextarea = document.getElementById('milkdown-source');
const modeButtons = document.querySelectorAll('#milkdown-mode-switch .vsword-md-mode-btn');
const toggleButtons = document.querySelectorAll('#milkdown-toggle-group .vsword-md-toggle-btn');

let editor;
let currentMarkdown = '';
let dirty = false;
let initialized = false;
let saveSeq = 0;
let slashController;
let blockHandleController;
let modeController;
// Debounce timer for source-mode textarea → host autosave (mirrors WYSIWYG behaviour).
let sourceDebounce = 0;
// T-3.4: cached outline snapshot so cursor-only moves don't rebuild the tree.
let outlineHeadings = [];
let outlineActiveId = null;

function publishOutline() {
	vscode?.postMessage({ type: 'outlineChanged', headings: outlineHeadings, activeId: outlineActiveId });
}

function refreshOutline(view) {
	if (!view) return;
	outlineHeadings = extractHeadings(view.state.doc);
	outlineActiveId = findEnclosingHeadingId(outlineHeadings, view.state.selection.from);
	publishOutline();
}

function refreshOutlineActiveOnly(view) {
	if (!view) return;
	const next = findEnclosingHeadingId(outlineHeadings, view.state.selection.from);
	if (next === outlineActiveId) return;
	outlineActiveId = next;
	publishOutline();
}

function setStatus(message, kind = 'info') {
	if (!status) return;
	status.textContent = message;
	status.dataset.kind = kind;
}

function serialize() {
	// T-3.3.2: in source mode the textarea is the source of truth.
	if (modeController?.isSourceMode()) {
		return modeController.getSourceValue();
	}
	if (!editor) return currentMarkdown;
	return editor.action(ctx => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));
}

function reportError(prefix, err) {
	const msg = err && err.stack ? err.stack : String(err);
	setStatus('[' + prefix + '] ' + (msg.split('\n')[0] || msg).slice(0, 240), 'error');
	vscode?.postMessage({ type: 'webviewError', prefix, message: msg });
	console.error('[vsword-milkdown]', prefix, err);
}

async function createEditor(markdown) {
	if (!root) throw new Error('Missing #milkdown-root');
	root.textContent = '';
	currentMarkdown = markdown;
	dirty = false;
	initialized = false;
	if (editor) {
		await editor.destroy(true);
		editor = undefined;
	}
	if (slashController) {
		slashController.destroy();
		slashController = undefined;
	}
	if (blockHandleController) {
		blockHandleController.destroy();
		blockHandleController = undefined;
	}
	editor = await Editor.make()
		.config(ctx => {
			ctx.set(rootCtx, root);
			ctx.set(defaultValueCtx, markdown);
			ctx.set(remarkStringifyOptionsCtx, TYPORA_STRINGIFY_OPTIONS);
			configureCodeBlockCtx(ctx);
			configureBlockHandle(ctx);
			configureMathKatex(ctx);
			configureWikilinkHost(ctx, vscode);
			ctx.get(listenerCtx).markdownUpdated((ctxRef, nextMarkdown) => {
				currentMarkdown = nextMarkdown;
				if (!initialized) return;
				dirty = true;
				setStatus('Unsaved changes…', 'dirty');
				vscode?.postMessage({ type: 'markdownUpdated', markdown: nextMarkdown });
				// T-3.4: rebuild outline on every doc change.
				refreshOutline(ctxRef.get(editorViewCtx));
			});
			// T-3.4: cursor moves update the active heading (highlight in Outline pane).
			ctx.get(listenerCtx).selectionUpdated(ctxRef => {
				if (!initialized) return;
				refreshOutlineActiveOnly(ctxRef.get(editorViewCtx));
			});
			// Register slash view via SlashProvider once the editor context is ready.
			ctx.set(slash.key, {
				view: view => {
					slashController = attachSlashMenu(ctx, root);
					return {
						update: (v, prevState) => slashController.update(v, prevState),
						destroy: () => slashController?.destroy(),
					};
				},
			});
			// T-3.5.1: install the host-backed image uploader on top of plugin-upload's default.
			configureImageUpload(ctx, vscode);
		})
		.use(listener)
		.use(commonmark)
		.use(gfm)
		.use(history)
		.use(prism)
		.use(math)
		.use(slash)
		.use(highlightPlugins)
		.use(underlinePlugins)
		.use(typoraShortcutPlugins)
		.use(inputRulePlugins)
		.use(focusModePlugins)
		.use(imageUploadPlugins)
		.use(remarkLiftImgHtmlPlugin)
		.use(imageResizePlugins)
		.use(tableChromeView)
		.use(columnResizingPlugin)
		.use(codeBlockChromePlugins)
		.use(blockHandlePlugins)
		.use(mathViewPlugins)
		.use(wikilinkPlugins)
		.create();
	currentMarkdown = serialize();
	initialized = true;
	setStatus('Ready', 'ok');
	// T-3.8: mount the hover block handle. Kept separate from `.use()` because
	// the handle DOM listens on the editor root, which only exists post-create.
	try {
		editor.action(ctx => { blockHandleController = installBlockHandle(ctx, root); });
	} catch (err) {
		reportError('block-handle-mount', err);
	}
	// T-3.4: seed the initial outline snapshot so the Outline pane fills as soon as it opens.
	try {
		editor.action(ctx => refreshOutline(ctx.get(editorViewCtx)));
	} catch (err) {
		reportError('outline-seed', err);
	}
}

// T-3.3.2: rebuild the editor from source-mode textarea content.
async function reloadEditorFromMarkdown(markdown, reason) {
	try {
		await createEditor(markdown);
		// The editor recreation resets dirty; if the user actually changed source, mark dirty.
		if (reason === 'source-exit' && markdown !== currentMarkdown) {
			dirty = true;
			setStatus('Unsaved changes…', 'dirty');
			vscode?.postMessage({ type: 'markdownUpdated', markdown });
		}
	} catch (err) {
		reportError(reason || 'reload', err);
	}
}

function requestSave() {
	const markdown = serialize();
	currentMarkdown = markdown;
	dirty = true;
	const requestId = 'manual-' + (++saveSeq);
	setStatus('Saving…', 'dirty');
	vscode?.postMessage({ type: 'save', requestId, markdown });
}

saveButton?.addEventListener('click', () => requestSave());

// T-3.3.2: source textarea autosave (debounced, mirrors WYSIWYG listenerCtx behaviour).
sourceTextarea?.addEventListener('input', () => {
	if (!modeController?.isSourceMode()) return;
	dirty = true;
	setStatus('Unsaved changes…', 'dirty');
	if (sourceDebounce) clearTimeout(sourceDebounce);
	sourceDebounce = setTimeout(() => {
		const md = sourceTextarea.value;
		currentMarkdown = md;
		vscode?.postMessage({ type: 'markdownUpdated', markdown: md });
	}, 300);
});

// Slash-menu keyboard interception: capturing so we win before ProseMirror's own bindings.
// The controller only claims a key when the menu is actually open.
document.addEventListener('keydown', event => {
	if (slashController?.onKey?.(event)) {
		event.preventDefault();
		event.stopPropagation();
	}
}, true);
window.addEventListener('keydown', event => {
	if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
		event.preventDefault();
		requestSave();
	}
});
window.addEventListener('error', e => reportError('uncaught', e.error || e.message));
window.addEventListener('unhandledrejection', e => reportError('promise', e.reason));

window.addEventListener('message', event => {
	const msg = event.data;
	if (!msg || typeof msg.type !== 'string') return;
	if (msg.type === 'init') {
		createEditor(String(msg.markdown ?? '')).catch(err => reportError('init', err));
		// Ask the host for the persisted mode preference; the response fires modeController.applyPersistedMode.
		vscode?.postMessage({ type: 'preferenceRequest' });
		// T-3.3.1: ask the host for the effective theme so we can paint before first user action.
		vscode?.postMessage({ type: 'themeRequest' });
		return;
	}
	if (msg.type === 'reload') {
		createEditor(String(msg.markdown ?? '')).catch(err => reportError('reload', err));
		// If we're currently in source mode, sync textarea too.
		if (modeController?.isSourceMode() && sourceTextarea) {
			sourceTextarea.value = String(msg.markdown ?? '');
		}
		return;
	}
	if (msg.type === 'dirtyChanged') {
		dirty = !!msg.dirty;
		setStatus(dirty ? 'Unsaved changes…' : 'Ready', dirty ? 'dirty' : 'ok');
		return;
	}
	if (msg.type === 'saved') {
		if (msg.ok) {
			dirty = false;
			setStatus('Saved', 'ok');
		} else {
			dirty = true;
			setStatus('Save failed: ' + String(msg.message || 'unknown error').slice(0, 180), 'error');
		}
		return;
	}
	if (msg.type === 'preferenceResponse') {
		// Backward compatible: older hosts only send `mode`, newer ones may include focus/typewriter.
		modeController?.applyPersistedPreference({
			mode: msg.mode,
			focus: msg.focus,
			typewriter: msg.typewriter,
		});
		return;
	}
	if (msg.type === 'wikilinkResolveResponse') {
		// T-3.11.1: host answered one or more resolve requests. `results` is an array
		// of { target, status, file? } entries; ingest & repaint every live NodeView.
		ingestResolutions(msg.results);
		return;
	}
	if (msg.type === 'workspaceIndexChanged') {
		// T-3.11.1: host tells us a .md was added/removed/renamed — flush the cache.
		invalidateWikilinkCache();
		return;
	}
	if (msg.type === 'themeChanged') {
		// T-3.3.1: set body[data-theme] so the CSS layer swaps tokens. `default` = drop the attr.
		const theme = String(msg.theme || 'default');
		if (theme === 'default' || theme === '') {
			document.body.removeAttribute('data-theme');
		} else {
			document.body.setAttribute('data-theme', theme);
		}
		return;
	}
	if (msg.type === 'hostError') {
		setStatus('Host error: ' + String(msg.message || 'unknown error').slice(0, 180), 'error');
		return;
	}
	if (msg.type === 'revealHeading') {
		// T-3.4: user clicked a heading in the Outline pane. Move selection + scroll into view.
		const pos = Number(msg.pos);
		if (!editor || !Number.isFinite(pos)) return;
		try {
			editor.action(ctx => {
				const view = ctx.get(editorViewCtx);
				const doc = view.state.doc;
				const safePos = Math.max(0, Math.min(pos, doc.content.size));
				const tr = view.state.tr.setSelection(
					view.state.selection.constructor.near(doc.resolve(safePos))
				).scrollIntoView();
				view.dispatch(tr);
				view.focus();
			});
		} catch (err) {
			reportError('revealHeading', err);
		}
	}
});

// T-3.3.2: create mode controller after DOM handles are grabbed. It owns Ctrl+/ and button clicks.
modeController = createModeController({
	shell,
	buttons: modeButtons,
	toggleButtons,
	sourceTextarea,
	getMarkdown: () => serialize(),
	setMarkdown: (md, reason) => reloadEditorFromMarkdown(md, reason),
	vscode,
});

vscode?.postMessage({ type: 'ready' });
window.__vswordMilkdown = {
	getMarkdown: serialize,
	isDirty: () => dirty,
	getMode: () => modeController?.getMode(),
	switchMode: m => modeController?.switchTo(m),
	isFocusOn: () => modeController?.isFocusOn(),
	isTypewriterOn: () => modeController?.isTypewriterOn(),
	setFocus: on => modeController?.setFocus(on),
	setTypewriter: on => modeController?.setTypewriter(on),
};
