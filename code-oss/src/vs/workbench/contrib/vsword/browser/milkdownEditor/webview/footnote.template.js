// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 *  VSWord T-3.5c.2 · Footnote 引用 + 定义 · NodeView + click/hover 交互
 *
 *  设计要点（PRD 003c §8 T-3.5c.2 · F-05..F-09）：
 *   - **不重定义 schema**：`@milkdown/preset-gfm` 已经 ship 了 footnoteReferenceSchema
 *     和 footnoteDefinitionSchema（inline atom `sup` + block `dl`），Round-trip 走 remark-gfm
 *     的 mdast handlers，我们只挂 NodeView + 交互层。
 *
 *  数据路径（F-09 保源码）：
 *    parse:   `[^label]`         --remark-gfm-> mdast footnoteReference
 *             `[^label]: text`   --remark-gfm-> mdast footnoteDefinition
 *             --preset-gfm parseMarkdown runner--> PM nodes footnote_reference / footnote_definition
 *
 *    write:   PM nodes --preset-gfm toMarkdown-> mdast footnoteReference / footnoteDefinition
 *             --remark-gfm stringifier-> `[^label]` / `[^label]: text`
 *
 *  NodeView 覆盖（本模块新增）：
 *   - footnote_reference: 渲染 `<sup class="vsword-footnote-ref" data-label=… data-key=…>label</sup>`。
 *     click → scrollIntoView 对应 definition，短暂高亮（F-08）。
 *     mouseenter → onFootnoteHoverEnter (F-07)，mouseleave → onFootnoteHoverLeave。
 *   - footnote_definition: 覆盖上游 `<dl>` 布局，改成 `<div class="vsword-footnote-def" …>`，
 *     内嵌 `<span class="vsword-footnote-def-label">[^label]</span>` + `<div class="vsword-footnote-def-body">`
 *     （contentDOM），符合 F-06 页脚定义列表观感。
 *--------------------------------------------------------------------------------------------*/

import { $view, $ctx } from '@milkdown/utils';
import {
	footnoteReferenceSchema,
	footnoteDefinitionSchema,
} from '@milkdown/preset-gfm';
import {
	normalizeLabel,
	sanitizeLabelForSelector,
} from './footnote-helpers.mjs';
import {
	onFootnoteHoverEnter,
	onFootnoteHoverLeave,
} from './footnote-preview.mjs';

// -----------------------------------------------------------------------------
// Host ctx：click / hover 需要一个 host 句柄（webview 里就是 vscode.postMessage
// 上层的一层薄壳；纯 hover-preview 无需 host RT — 因为 footnote definition 就在
// 同一 doc 里，直接从 view.state.doc 读定义即可）。这里主要给 click 报点击动作用。
// -----------------------------------------------------------------------------

/** ctx slot：存 view 引用，供 hover controller 反查 definition。 */
export const footnoteHostCtx = $ctx({ vscode: null, getView: null }, 'vswordFootnoteHost');

export function configureFootnoteHost(ctx, { vscode, getView } = {}) {
	ctx.set(footnoteHostCtx.key, { vscode: vscode || null, getView: getView || null });
}

// -----------------------------------------------------------------------------
// Reference NodeView（inline atom · sup）
// -----------------------------------------------------------------------------
// F-05 · 上标可点击。F-08 · 点击后 scrollIntoView + 短暂高亮定义。F-07 · hover → popover。
// selectable=true 让 ProseMirror 光标能停在这个 atom 上、Backspace 也能删掉整个 sup。

// 短暂高亮的 timer 句柄，全局唯一（多次点击时前次未消散就覆盖）。
let _highlightTimer = null;

function highlightDefinition(defEl) {
	if (!defEl) return;
	defEl.classList.add('vsword-footnote-def-flash');
	if (_highlightTimer) { clearTimeout(_highlightTimer); _highlightTimer = null; }
	_highlightTimer = setTimeout(() => {
		try { defEl.classList.remove('vsword-footnote-def-flash'); } catch { /* disposed */ }
		_highlightTimer = null;
	}, 1600);
}

function findDefinitionElement(container, label) {
	if (!container) return null;
	const safe = sanitizeLabelForSelector(label);
	// 精确匹配 label 优先（保源码：源码 label 是大小写敏感）。
	let el = container.querySelector(`.vsword-footnote-def[data-label="${safe}"]`);
	if (el) return el;
	// 大小写不敏感兜底（有的 renderer 会小写化）。
	const key = normalizeLabel(label);
	if (!key) return null;
	const all = container.querySelectorAll('.vsword-footnote-def[data-key]');
	for (const node of all) {
		if (node.dataset.key === key) return node;
	}
	return null;
}

function jumpToDefinition(view, label) {
	const editorDom = view?.dom;
	if (!editorDom) return;
	const container = editorDom.ownerDocument?.body || editorDom;
	const defEl = findDefinitionElement(container, label);
	if (!defEl) return;
	try { defEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
	catch { defEl.scrollIntoView(); }
	highlightDefinition(defEl);
}

function createFootnoteRefNodeView(getHost) {
	return (node, view, _getPos) => {
		const dom = document.createElement('sup');
		dom.className = 'vsword-footnote-ref';
		dom.setAttribute('contenteditable', 'false');
		const label = String(node.attrs?.label || '');
		dom.dataset.label = label;
		dom.dataset.key = normalizeLabel(label);
		dom.setAttribute('role', 'doc-noteref');
		dom.setAttribute('aria-label', `脚注引用 [^${label}]`);
		dom.title = `[^${label}]`;
		dom.textContent = label;

		const onClick = (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			jumpToDefinition(view, label);
			// 也报给 host（可选，host 未处理不影响功能）。
			try { getHost()?.vscode?.postMessage?.({ type: 'openFootnote', label }); }
			catch { /* ignore */ }
		};
		const onEnter = () => onFootnoteHoverEnter({ label, view });
		const onLeave = () => onFootnoteHoverLeave();

		dom.addEventListener('click', onClick);
		dom.addEventListener('mouseenter', onEnter);
		dom.addEventListener('mouseleave', onLeave);

		return {
			dom,
			update(newNode) {
				if (newNode.type.name !== 'footnote_reference') return false;
				const newLabel = String(newNode.attrs?.label || '');
				if (newLabel !== dom.dataset.label) {
					dom.dataset.label = newLabel;
					dom.dataset.key = normalizeLabel(newLabel);
					dom.textContent = newLabel;
					dom.setAttribute('aria-label', `脚注引用 [^${newLabel}]`);
					dom.title = `[^${newLabel}]`;
				}
				return true;
			},
			selectNode() { dom.classList.add('vsword-footnote-ref-selected'); },
			deselectNode() { dom.classList.remove('vsword-footnote-ref-selected'); },
			ignoreMutation() { return true; },
			destroy() {
				dom.removeEventListener('click', onClick);
				dom.removeEventListener('mouseenter', onEnter);
				dom.removeEventListener('mouseleave', onLeave);
			},
		};
	};
}

// -----------------------------------------------------------------------------
// Definition NodeView（block · dl → div 页脚外观）
// -----------------------------------------------------------------------------
// F-06 · 页脚定义列表区。上游 preset-gfm 用 `<dl><dt><dd>`，为了走
// 「.vsword-footnote-def」CSS + 让 backlinks-footer 视觉不冲突，我们用 div。
// contentDOM 挂在正文（block+），label 是只读装饰、由 attrs 驱动。

function createFootnoteDefNodeView() {
	return (node, _view, _getPos) => {
		const dom = document.createElement('div');
		dom.className = 'vsword-footnote-def';
		const label = String(node.attrs?.label || '');
		dom.dataset.label = label;
		dom.dataset.key = normalizeLabel(label);
		dom.setAttribute('role', 'doc-endnote');

		const marker = document.createElement('span');
		marker.className = 'vsword-footnote-def-label';
		marker.setAttribute('contenteditable', 'false');
		marker.textContent = `[^${label}]:`;
		marker.title = `脚注定义 [^${label}]`;
		dom.appendChild(marker);

		const body = document.createElement('div');
		body.className = 'vsword-footnote-def-body';
		dom.appendChild(body);

		return {
			dom,
			contentDOM: body,
			update(newNode) {
				if (newNode.type.name !== 'footnote_definition') return false;
				const newLabel = String(newNode.attrs?.label || '');
				if (newLabel !== dom.dataset.label) {
					dom.dataset.label = newLabel;
					dom.dataset.key = normalizeLabel(newLabel);
					marker.textContent = `[^${newLabel}]:`;
					marker.title = `脚注定义 [^${newLabel}]`;
				}
				return true;
			},
			// stopEvent + ignoreMutation 只针对 label marker；contentDOM 让 ProseMirror 自己管。
			ignoreMutation(mutation) {
				return marker.contains(mutation.target);
			},
			stopEvent(ev) {
				// label marker 点击不冒到编辑器（保持只读装饰）。
				return ev.target === marker || marker.contains(ev.target);
			},
		};
	};
}

// -----------------------------------------------------------------------------
// $view 挂载
// -----------------------------------------------------------------------------

export const footnoteReferenceView = $view(footnoteReferenceSchema.node, (ctx) => {
	const getHost = () => ctx.get(footnoteHostCtx.key);
	return createFootnoteRefNodeView(getHost);
});

export const footnoteDefinitionView = $view(footnoteDefinitionSchema.node, (_ctx) => {
	return createFootnoteDefNodeView();
});

// -----------------------------------------------------------------------------
// Bundle
// -----------------------------------------------------------------------------

export const footnotePlugins = [
	footnoteHostCtx,
	footnoteReferenceView,
	footnoteDefinitionView,
].flat();
