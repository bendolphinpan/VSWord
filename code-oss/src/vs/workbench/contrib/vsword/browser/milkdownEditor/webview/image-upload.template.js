// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  T-3.5.1: pasted / dropped image handler.
 *
 *  Wraps @milkdown/plugin-upload with an uploader that ships each File up to the
 *  workbench host via postMessage, waits for the host to persist it, and returns
 *  a ProseMirror `image` node pointing at the resulting relative path. The host
 *  contribution decides the target directory (Settings) and dedupes filenames.
 *
 *  Design:
 *   - `enableHtmlFileUploader = false` (the plugin default). When the clipboard
 *     carries `text/html` the plugin bows out, letting commonmark/gfm parse
 *     `<img src="https://…">` as a normal external link — that's exactly Q4=a
 *     (do not auto-download remote URLs).
 *   - `bytesBase64` because postMessage in this webview flavor is JSON-only.
 *     Chunked upload is unnecessary for typical clipboard image sizes.
 *   - Callers resolve their own requestId promise; multiple concurrent drops
 *     work without cross-talk.
 *--------------------------------------------------------------------------------------------*/

import { upload, uploadConfig } from '@milkdown/plugin-upload';
import { missingNodeInSchema } from '@milkdown/exception';

let seq = 0;
const pending = new Map();
let bridgeInstalled = false;

/**
 * Wire the webview `window.message` bus into the pending upload registry.
 * Idempotent (safe to call more than once — subsequent calls no-op).
 */
export function installImageUploadMessageBridge() {
	if (bridgeInstalled) return;
	bridgeInstalled = true;
	window.addEventListener('message', event => {
		const msg = event.data;
		if (!msg || typeof msg.type !== 'string') return;
		if (msg.type === 'imageUploaded') {
			const entry = pending.get(msg.requestId);
			if (!entry) return;
			pending.delete(msg.requestId);
			entry.resolve({ src: String(msg.relativePath || ''), alt: String(msg.alt ?? '') });
			return;
		}
		if (msg.type === 'imageUploadFailed') {
			const entry = pending.get(msg.requestId);
			if (!entry) return;
			pending.delete(msg.requestId);
			entry.reject(new Error(String(msg.message || 'upload failed')));
		}
	});
}

function fileToBase64(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
		reader.onload = () => {
			const result = String(reader.result ?? '');
			// dataURL header is `data:<mime>;base64,` — strip it.
			const comma = result.indexOf(',');
			resolve(comma >= 0 ? result.slice(comma + 1) : result);
		};
		reader.readAsDataURL(file);
	});
}

function askHostToPersist(vscode, file) {
	return new Promise(async (resolve, reject) => {
		let bytesBase64;
		try {
			bytesBase64 = await fileToBase64(file);
		} catch (err) {
			reject(err);
			return;
		}
		const requestId = 'img-' + (++seq) + '-' + Date.now().toString(36);
		pending.set(requestId, { resolve, reject });
		try {
			vscode?.postMessage({
				type: 'imageUpload',
				requestId,
				bytesBase64,
				mime: file.type || 'application/octet-stream',
				suggestedName: file.name || '',
			});
		} catch (err) {
			pending.delete(requestId);
			reject(err);
		}
	});
}

/**
 * Uploader shape required by @milkdown/plugin-upload:
 *   (files, schema, ctx, insertPos) => Promise<Fragment | Node | Node[]>
 * Returns one ProseMirror `image` node per successfully-persisted file.
 */
export function createHostImageUploader(vscode) {
	return async (files, schema) => {
		const { image } = schema.nodes;
		if (!image) throw missingNodeInSchema('image');
		const results = [];
		for (let i = 0; i < files.length; i++) {
			const file = files.item(i);
			if (!file) continue;
			if (!file.type.startsWith('image/')) continue;
			try {
				const { src, alt } = await askHostToPersist(vscode, file);
				const node = image.createAndFill({ src, alt });
				if (node) results.push(node);
			} catch (err) {
				console.error('[vsword-milkdown] image upload failed:', err);
				vscode?.postMessage({ type: 'webviewError', prefix: 'image-upload', message: String(err && err.message || err) });
			}
		}
		return results;
	};
}

/**
 * Inside the editor's `.config()` block, install the host-backed uploader onto
 * uploadConfig.key so the plugin's paste/drop handlers use it.
 */
export function configureImageUpload(ctx, vscode) {
	const uploader = createHostImageUploader(vscode);
	const current = ctx.get(uploadConfig.key);
	ctx.set(uploadConfig.key, { ...current, uploader });
}

/** Milkdown plugin bundle for `.use(...)`. Pair with `configureImageUpload` inside `.config()`. */
export const imageUploadPlugins = upload;
