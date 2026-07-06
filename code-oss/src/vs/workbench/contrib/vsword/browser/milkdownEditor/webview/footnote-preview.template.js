// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 *  VSWord T-3.5c.2 · Footnote hover preview（F-07）
 *
 *  相较 wikilink-preview 的差异：
 *   - **数据源在本 doc 内部**：footnote_definition 就活在当前 ProseMirror doc 里，
 *     不需要走 host RT（wikilinkPreviewRequest / Response 那套 messagebus）。
 *     hover 时直接从 view.state.doc 里索引 label → summary，纯同步。
 *   - 状态机沿用 wikilink-preview 的 idle → pending → shown → closing 三段（延迟避免抖动），
 *     但去掉 requestId / async correlation 那一层，简化很多。
 *   - 未识别 label（正文引用了但没有对应定义）→ popover 显示 "未找到定义 [^label]" 提示。
 *--------------------------------------------------------------------------------------------*/

import {
	normalizeLabel,
	truncateForPreview,
} from './footnote-helpers.mjs';

const POPOVER_ID = 'vsword-footnote-preview';
export const OPEN_DELAY_MS = 200;
export const CLOSE_DELAY_MS = 100;

// -----------------------------------------------------------------------------
// 纯状态机（与 wikilink-preview 同构 · 可 node 单测）
// -----------------------------------------------------------------------------

/**
 * @typedef {'idle'|'pending'|'shown'|'closing'} HoverState
 * @typedef {{ label: string }} HoverTarget
 */

export class FootnoteHoverIntent {
	constructor(now = () => Date.now()) {
		this.state = 'idle';
		this.target = null;
		this.openAt = 0;
		this.closeAt = 0;
		this._now = now;
	}
	enterAnchor(target) {
		this.target = target;
		if (this.state === 'closing') {
			this.state = 'shown';
			this.closeAt = 0;
			return { action: 'cancel-close' };
		}
		if (this.state === 'idle') {
			this.state = 'pending';
			this.openAt = this._now() + OPEN_DELAY_MS;
			return { action: 'schedule-open', at: this.openAt };
		}
		this.openAt = this._now() + OPEN_DELAY_MS;
		return { action: 'schedule-open', at: this.openAt };
	}
	leaveAnchor() {
		if (this.state === 'pending') {
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

// -----------------------------------------------------------------------------
// 从 PM doc 里索引 footnote_definition：label → 纯文本预览
// -----------------------------------------------------------------------------

/**
 * 遍历 view.state.doc，抽出所有 footnote_definition 节点，label 归一化后建 map。
 * 首次 win：GFM 规定重复 label 时只保留首次定义。
 * @param {any} view ProseMirror EditorView
 * @returns {Map<string, { label: string, preview: string }>}
 */
export function buildDefinitionIndexFromView(view) {
	const map = new Map();
	if (!view?.state?.doc) return map;
	view.state.doc.descendants((node) => {
		if (node.type?.name !== 'footnote_definition') return true;
		const label = String(node.attrs?.label || '');
		const key = normalizeLabel(label);
		if (!key || map.has(key)) return false; // atom-ish：不递归到内部
		// 用 textBetween 抽纯文本；PM 已知比 mdast 更贴近实际渲染。
		const preview = truncateForPreview(node.textBetween(0, node.content.size, '\n\n', ' '));
		map.set(key, { label, preview });
		return false; // 不需要下探
	});
	return map;
}

// -----------------------------------------------------------------------------
// DOM-bound controller
// -----------------------------------------------------------------------------

let host = null;                     // { getView } — 用来拿当前 view 反查 definition
let popover = null;                  // Popover 实例
const intent = new FootnoteHoverIntent();
let openTimer = null;
let closeTimer = null;

class Popover {
	constructor() {
		this.el = document.createElement('div');
		this.el.id = POPOVER_ID;
		this.el.className = 'vsword-footnote-preview';
		this.el.setAttribute('role', 'tooltip');
		this.el.style.display = 'none';
		this.el.addEventListener('mouseenter', () => onPopoverEnter());
		this.el.addEventListener('mouseleave', () => onPopoverLeave());
		document.body.appendChild(this.el);
	}
	dispose() { this.el.remove(); }
	setContent({ label, preview, missing }) {
		this.el.innerHTML = '';
		const title = document.createElement('div');
		title.className = 'vsword-footnote-preview-title';
		title.textContent = `[^${label}]`;
		const body = document.createElement('div');
		body.className = 'vsword-footnote-preview-body';
		if (missing) {
			body.classList.add('is-missing');
			body.textContent = '未找到脚注定义';
		} else {
			body.textContent = preview || '(空定义)';
		}
		this.el.appendChild(title);
		this.el.appendChild(body);
	}
	positionAt(rect) {
		this.el.style.display = '';
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

function onPopoverEnter() {
	clearCloseTimer();
	intent.enterPopover();
}
function onPopoverLeave() {
	const r = intent.leavePopover();
	if (r.action === 'schedule-close') scheduleClose();
}
function scheduleOpen(view) {
	clearOpenTimer();
	openTimer = setTimeout(() => {
		openTimer = null;
		const r = intent.fireOpen();
		if (r.action !== 'open' || !r.target) return;
		const label = r.target.label;
		const rect = anchorRect(label);
		const p = ensurePopover();
		const index = buildDefinitionIndexFromView(view);
		const entry = index.get(normalizeLabel(label));
		p.setContent({
			label,
			preview: entry?.preview || '',
			missing: !entry,
		});
		if (rect) p.positionAt(rect);
		p.show();
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

function anchorRect(label) {
	if (!label) return null;
	// data-label 匹配（大小写敏感 —— 与源码 label 一致）。
	const attr = String(label).replace(/"/g, '\\"');
	const el = document.querySelector(`.vsword-footnote-ref[data-label="${attr}"]`);
	if (!el) return null;
	return el.getBoundingClientRect();
}

/** 由 entry.template.js 在编辑器创建后调用一次。 */
export function configureFootnotePreview(bridge) {
	host = bridge || null;
}

/** 由 NodeView 光标 hover 时调用。 */
export function onFootnoteHoverEnter({ label, view }) {
	if (typeof label !== 'string' || label.length === 0) return;
	const r = intent.enterAnchor({ label });
	if (r.action === 'schedule-open') { clearOpenTimer(); scheduleOpen(view || host?.getView?.()); }
	if (r.action === 'cancel-close')  { clearCloseTimer(); }
}

export function onFootnoteHoverLeave() {
	const r = intent.leaveAnchor();
	if (r.action === 'cancel-open')    { clearOpenTimer(); }
	if (r.action === 'schedule-close') { scheduleClose(); }
}

/** 主要给测试 / hot-reload 用。 */
export function _resetFootnotePreview() {
	clearOpenTimer();
	clearCloseTimer();
	intent.reset();
	popover?.hide();
}
