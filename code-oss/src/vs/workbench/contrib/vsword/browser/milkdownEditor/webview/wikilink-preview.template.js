/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.11.3 · wiki-link hover preview popover.
//
// A singleton DOM widget with a small hover-intent state machine:
//   idle → pending (mouseenter, 200ms delay) → shown (host answers)
//   any state + mouseleave → closing (100ms grace) → idle
// If the mouse re-enters the anchor OR the popover itself during grace, the
// close is cancelled. This lets the user drift into the popover to keep it
// alive without twitchy dismissal.

const POPOVER_ID = 'vsword-wikilink-preview';

// Default timings — exported so tests can drive `HoverIntent` deterministically.
export const OPEN_DELAY_MS = 200;
export const CLOSE_DELAY_MS = 100;

let requestSeq = 1;

// ---------------------------------------------------------------------------
// Pure state machine — no DOM, easy to unit-test.
// ---------------------------------------------------------------------------

/**
 * @typedef {'idle'|'pending'|'shown'|'closing'} HoverState
 * @typedef {{ target: string, alias: string|null }} HoverTarget
 */

/**
 * A tiny finite-state machine that translates mouse events into `open` /
 * `cancel` / `close` intents. Timing is delegated to the caller (see
 * `HoverController` for the DOM-driven binding). Every method returns the
 * updated public state so tests can assert transitions without touching a
 * DOM.
 */
export class HoverIntent {
	constructor(now = () => Date.now()) {
		this.state = 'idle';
		this.target = null;     // HoverTarget currently under hover
		this.openAt = 0;        // timestamp when open should fire
		this.closeAt = 0;       // timestamp when close should fire
		this._now = now;
	}
	enterAnchor(target) {
		this.target = target;
		if (this.state === 'closing') {
			// User drifted back — cancel the pending close.
			this.state = 'shown';
			this.closeAt = 0;
			return { action: 'cancel-close' };
		}
		if (this.state === 'idle') {
			this.state = 'pending';
			this.openAt = this._now() + OPEN_DELAY_MS;
			return { action: 'schedule-open', at: this.openAt };
		}
		// Already pending or shown for a different anchor — reset timer.
		this.openAt = this._now() + OPEN_DELAY_MS;
		return { action: 'schedule-open', at: this.openAt };
	}
	leaveAnchor() {
		if (this.state === 'pending') {
			// Never opened — just drop back to idle.
			this.state = 'idle';
			this.target = null;
			this.openAt = 0;
			return { action: 'cancel-open' };
		}
		if (this.state === 'shown') {
			this.state = 'closing';
			this.closeAt = this._now() + CLOSE_DELAY_MS;
			return { action: 'schedule-close', at: this.closeAt };
		}
		return { action: 'noop' };
	}
	enterPopover() {
		if (this.state === 'closing') {
			this.state = 'shown';
			this.closeAt = 0;
			return { action: 'cancel-close' };
		}
		return { action: 'noop' };
	}
	leavePopover() {
		if (this.state === 'shown') {
			this.state = 'closing';
			this.closeAt = this._now() + CLOSE_DELAY_MS;
			return { action: 'schedule-close', at: this.closeAt };
		}
		return { action: 'noop' };
	}
	fireOpen() {
		if (this.state !== 'pending') return { action: 'noop' };
		this.state = 'shown';
		this.openAt = 0;
		return { action: 'open', target: this.target };
	}
	fireClose() {
		if (this.state !== 'closing') return { action: 'noop' };
		this.state = 'idle';
		this.target = null;
		this.closeAt = 0;
		return { action: 'close' };
	}
	reset() {
		this.state = 'idle';
		this.target = null;
		this.openAt = 0;
		this.closeAt = 0;
	}
}

// ---------------------------------------------------------------------------
// DOM-bound controller (webview-only). Skipped by unit tests, which drive
// HoverIntent directly.
// ---------------------------------------------------------------------------

let host = null;      // { postToHost(msg) }
let popover = null;   // Popover instance
const intent = new HoverIntent();
let openTimer = null;
let closeTimer = null;
const pendingByRequest = new Map(); // requestId → target (to correlate responses)

class Popover {
	constructor() {
		this.el = document.createElement('div');
		this.el.id = POPOVER_ID;
		this.el.className = 'vsword-wikilink-preview';
		this.el.setAttribute('role', 'tooltip');
		this.el.style.display = 'none';
		this.el.addEventListener('mouseenter', () => onPopoverEnter());
		this.el.addEventListener('mouseleave', () => onPopoverLeave());
		document.body.appendChild(this.el);
	}
	dispose() { this.el.remove(); }
	setLoading(target) {
		this.el.innerHTML = '';
		const title = document.createElement('div');
		title.className = 'vsword-wikilink-preview-title';
		title.textContent = target;
		const body = document.createElement('div');
		body.className = 'vsword-wikilink-preview-body is-loading';
		body.textContent = '正在加载…';
		this.el.appendChild(title);
		this.el.appendChild(body);
	}
	setResponse(msg) {
		this.el.innerHTML = '';
		const title = document.createElement('div');
		title.className = 'vsword-wikilink-preview-title';
		title.textContent = msg.title || msg.target;
		const body = document.createElement('div');
		body.className = 'vsword-wikilink-preview-body';
		if (msg.status === 'ok') {
			body.textContent = msg.snippet || '(空文件)';
		} else if (msg.status === 'missing') {
			body.classList.add('is-missing');
			body.textContent = '文件不存在';
		} else {
			body.classList.add('is-error');
			body.textContent = '无法读取';
		}
		this.el.appendChild(title);
		this.el.appendChild(body);
		if (msg.path) {
			const meta = document.createElement('div');
			meta.className = 'vsword-wikilink-preview-path';
			meta.textContent = msg.path;
			this.el.appendChild(meta);
		}
	}
	positionAt(rect) {
		// Prefer below the anchor; flip up on clip. Constrain horizontally.
		this.el.style.display = ''; // must be visible for measuring
		const size = this.el.getBoundingClientRect();
		const pad = 6;
		let top = rect.bottom + pad;
		if (top + size.height > window.innerHeight - 8) {
			top = rect.top - size.height - pad;
		}
		let left = rect.left;
		if (left + size.width > window.innerWidth - 8) {
			left = window.innerWidth - size.width - 8;
		}
		this.el.style.left = Math.max(8, left) + 'px';
		this.el.style.top = Math.max(8, top) + 'px';
	}
	show() { this.el.style.display = ''; }
	hide() { this.el.style.display = 'none'; this.el.innerHTML = ''; }
}

function ensurePopover() {
	if (!popover) popover = new Popover();
	return popover;
}

function clearOpenTimer() { if (openTimer) { clearTimeout(openTimer); openTimer = null; } }
function clearCloseTimer() { if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; } }

function requestPreview(target) {
	if (!host?.postToHost) return;
	const requestId = requestSeq++;
	pendingByRequest.set(requestId, target);
	try { host.postToHost({ type: 'wikilinkPreviewRequest', requestId, target }); }
	catch { /* ignore */ }
}

function anchorRect(target) {
	// Position off the currently-hovered .vsword-wikilink DOM node. We find it
	// via `data-target` — the NodeView stamps that attribute at render time.
	if (!target) return null;
	const attr = String(target.target || '').replace(/"/g, '\\"');
	const el = document.querySelector(`.vsword-wikilink[data-target="${attr}"]`);
	if (!el) return null;
	return el.getBoundingClientRect();
}

function onPopoverEnter() {
	clearCloseTimer();
	intent.enterPopover();
}
function onPopoverLeave() {
	const r = intent.leavePopover();
	if (r.action === 'schedule-close') scheduleClose();
}
function scheduleOpen() {
	clearOpenTimer();
	openTimer = setTimeout(() => {
		openTimer = null;
		const r = intent.fireOpen();
		if (r.action !== 'open' || !r.target) return;
		const rect = anchorRect(r.target);
		const p = ensurePopover();
		p.setLoading(r.target.target);
		if (rect) p.positionAt(rect);
		p.show();
		requestPreview(r.target.target);
	}, OPEN_DELAY_MS);
}
function scheduleClose() {
	clearCloseTimer();
	closeTimer = setTimeout(() => {
		closeTimer = null;
		const r = intent.fireClose();
		if (r.action === 'close') popover?.hide();
	}, CLOSE_DELAY_MS);
}

/** Wire the preview controller. Call once from entry.template.js. */
export function configureWikilinkPreview(bridge) {
	host = bridge;
}

/** Called by the NodeView when the pointer enters a rendered wiki-link. */
export function onWikilinkHoverEnter(target) {
	if (!target || typeof target.target !== 'string') return;
	const r = intent.enterAnchor(target);
	if (r.action === 'schedule-open') { clearOpenTimer(); scheduleOpen(); }
	if (r.action === 'cancel-close')  { clearCloseTimer(); }
}

/** Called by the NodeView when the pointer leaves a rendered wiki-link. */
export function onWikilinkHoverLeave() {
	const r = intent.leaveAnchor();
	if (r.action === 'cancel-open')   { clearOpenTimer(); }
	if (r.action === 'schedule-close') { scheduleClose(); }
}

/** Called by entry.template.js on `wikilinkPreviewResponse`. */
export function ingestPreviewResponse(msg) {
	if (!msg || typeof msg.requestId !== 'number') return;
	const target = pendingByRequest.get(msg.requestId);
	pendingByRequest.delete(msg.requestId);
	if (!target) return;
	// Only update the popover if it's still shown/pending for THIS anchor.
	if (intent.target?.target !== target && intent.state !== 'idle') return;
	popover?.setResponse(msg);
}

/** Reset (for hot-reload / tests). */
export function _resetWikilinkPreview() {
	clearOpenTimer();
	clearCloseTimer();
	intent.reset();
	pendingByRequest.clear();
	popover?.hide();
}
