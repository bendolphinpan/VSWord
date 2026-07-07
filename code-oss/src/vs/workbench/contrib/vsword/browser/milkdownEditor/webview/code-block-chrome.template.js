// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7 — Code block chrome + prism language registration.
//
// Architecture: a single `$view` NodeView on codeBlockSchema.node wraps the
// native <pre><code></code></pre> with a positioned chrome container. Chrome
// (language picker button + popover + copy button) live as sibling <div>s;
// <pre>/<code> is PM's contentDOM. All chrome mutations are DOM-only and
// hidden from PM via `ignoreMutation` (mirrors T-3.6 table-chrome pattern).
//
// Prism / refractor: preset-gfm's plugin-prism ships with an empty
// `configureRefractor` config — no languages registered, no highlight. We
// register the canonical 27 (see code-block-helpers) via a $ctx override.
//
// Keymap (Q5=b Tab=真Tab, Q6=a Ctrl-Enter 跳出): a $prose plugin adds the
// three key handlers scoped to `code_block` nodes only.

import { refractor } from 'refractor/core';
import bash from 'refractor/bash';
import c from 'refractor/c';
import cpp from 'refractor/cpp';
import csharp from 'refractor/csharp';
import css from 'refractor/css';
import diff from 'refractor/diff';
import docker from 'refractor/docker';
import go from 'refractor/go';
import ini from 'refractor/ini';
import java from 'refractor/java';
import javascript from 'refractor/javascript';
import json from 'refractor/json';
import jsx from 'refractor/jsx';
import markdown from 'refractor/markdown';
import markup from 'refractor/markup';
import nginx from 'refractor/nginx';
import php from 'refractor/php';
import powershell from 'refractor/powershell';
import python from 'refractor/python';
import ruby from 'refractor/ruby';
import rust from 'refractor/rust';
import scss from 'refractor/scss';
import sql from 'refractor/sql';
import toml from 'refractor/toml';
import tsx from 'refractor/tsx';
import typescript from 'refractor/typescript';
import yaml from 'refractor/yaml';

import { $view, $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { codeBlockSchema } from '@milkdown/preset-commonmark';
import { prismConfig } from '@milkdown/plugin-prism';

import {
	CODE_LANGS,
	labelForLang,
	normalizeLangKey,
	searchLangs,
	refractorLangIds,
} from './code-block-helpers.mjs';

// T-3.5b.2: mermaid NodeView 分派。
import { createMermaidNodeView } from './mermaid-view.mjs';
// T-3.5b-flow.2: flowchart.js NodeView 分派（language=flow）。
import { createFlowchartNodeView } from './flowchart-view.mjs';
// T-3.5b-seq.2: js-sequence-diagrams NodeView 分派（language=sequence）。
import { createSequenceNodeView } from './sequence-view.mjs';

export { CODE_LANGS, labelForLang, normalizeLangKey, searchLangs, refractorLangIds };

// Register the 27 refractor language modules. Refractor 5 exposes register()
// on the shared instance; calling it once at module init means all editors
// share the same registry.
const LANG_MODULES = [
	bash, c, cpp, csharp, css, diff, docker, go, ini, java, javascript, json,
	jsx, markdown, markup, nginx, php, powershell, python, ruby, rust, scss,
	sql, toml, tsx, typescript, yaml,
];
for (const mod of LANG_MODULES) {
	try { refractor.register(mod); } catch { /* already-registered is fine */ }
}

// Override plugin-prism's empty configureRefractor with a no-op that returns
// our pre-registered refractor. Called from entry.template.js inside
// `.config()`, before the editor is created.
export function configureCodeBlockCtx(ctx) {
	ctx.set(prismConfig.key, { configureRefractor: () => refractor });
}

// -----------------------------------------------------------------------------
// Copy-to-clipboard helper. Uses navigator.clipboard (available in the webview
// origin) with a document.execCommand fallback for hardened contexts.
// -----------------------------------------------------------------------------

function copyText(doc, text) {
	try {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(text);
			return true;
		}
	} catch { /* fall through */ }
	try {
		const ta = doc.createElement('textarea');
		ta.value = text;
		ta.style.position = 'fixed';
		ta.style.opacity = '0';
		doc.body.appendChild(ta);
		ta.select();
		const ok = doc.execCommand('copy');
		ta.remove();
		return ok;
	} catch {
		return false;
	}
}

// -----------------------------------------------------------------------------
// Language picker popover. Renders inline into a container element; the caller
// owns opening / closing / focusing. Interaction:
//   - typing in the input filters via searchLangs()
//   - ArrowUp / ArrowDown moves the highlight
//   - Enter picks the highlighted row (or, if no rows, commits the raw input)
//   - Escape closes without committing
// -----------------------------------------------------------------------------

function buildPickerPopover(doc, currentLang, onCommit) {
	const pop = doc.createElement('div');
	pop.className = 'vsword-code-lang-pop';

	const input = doc.createElement('input');
	input.type = 'text';
	input.className = 'vsword-code-lang-input';
	input.placeholder = '搜索语言…';
	input.value = '';

	const listBox = doc.createElement('div');
	listBox.className = 'vsword-code-lang-list';
	listBox.setAttribute('role', 'listbox');

	pop.append(input, listBox);

	let items = [];  // [{ id, label, node }]
	let hi = 0;      // highlighted index

	function render(query) {
		listBox.textContent = '';
		items = [];
		const scored = searchLangs(query);
		scored.forEach(({ entry }, idx) => {
			const row = doc.createElement('div');
			row.className = 'vsword-code-lang-item';
			row.setAttribute('role', 'option');
			row.dataset.id = entry.id;
			row.textContent = entry.id === ''
				? entry.label
				: `${entry.label} · ${entry.id}`;
			if (normalizeLangKey(entry.id) === normalizeLangKey(currentLang)) {
				row.dataset.current = 'true';
			}
			row.addEventListener('mousedown', ev => {
				ev.preventDefault();
				ev.stopPropagation();
				onCommit(entry.id);
			});
			listBox.appendChild(row);
			items.push({ id: entry.id, label: entry.label, node: row });
		});
		hi = 0;
		updateHighlight();
	}

	function updateHighlight() {
		items.forEach((it, i) => {
			if (i === hi) it.node.dataset.highlight = 'true';
			else it.node.removeAttribute('data-highlight');
		});
		if (items[hi]) {
			items[hi].node.scrollIntoView({ block: 'nearest' });
		}
	}

	input.addEventListener('input', () => render(input.value));
	input.addEventListener('keydown', ev => {
		if (ev.key === 'ArrowDown') { ev.preventDefault(); if (items.length) { hi = (hi + 1) % items.length; updateHighlight(); } }
		else if (ev.key === 'ArrowUp')   { ev.preventDefault(); if (items.length) { hi = (hi - 1 + items.length) % items.length; updateHighlight(); } }
		else if (ev.key === 'Enter') {
			ev.preventDefault();
			if (items[hi])       onCommit(items[hi].id);
			else if (input.value) onCommit(input.value.trim());
			else                  onCommit('');
		}
		else if (ev.key === 'Escape') { ev.preventDefault(); onCommit(null); /* cancel */ }
	});

	render('');
	// Async focus so the popover is in the layout tree first.
	setTimeout(() => input.focus(), 0);

	return pop;
}

// -----------------------------------------------------------------------------
// Code-block NodeView.
// -----------------------------------------------------------------------------

function codeBlockNodeViewFactory(ctx) {
	return (node, view, getPos) => {
		// T-3.5b.2: mermaid code_block 走独立 NodeView。
		// 注意：language 变更（mermaid ↔ 非 mermaid）在下方 update() 里返回 false，
		// 交由 ProseMirror 重建 NodeView，从而重新走这里的分派。
		if ((node.attrs.language || '') === 'mermaid') {
			return createMermaidNodeView(node, view, getPos);
		}
		// T-3.5b-flow.2: flow code_block 走独立 NodeView。
		if ((node.attrs.language || '') === 'flow') {
			return createFlowchartNodeView(node, view, getPos);
		}
		// T-3.5b-seq.2: sequence code_block 走独立 NodeView（js-sequence-diagrams）。
		if ((node.attrs.language || '') === 'sequence') {
			return createSequenceNodeView(node, view, getPos);
		}

		const doc = view.dom.ownerDocument;
		const wrap = doc.createElement('div');
		wrap.className = 'vsword-code-wrap';

		const pre = doc.createElement('pre');
		pre.className = 'vsword-code-pre';
		const codeEl = doc.createElement('code');
		pre.appendChild(codeEl);

		const chrome = doc.createElement('div');
		chrome.className = 'vsword-code-chrome';

		const langBtn = doc.createElement('button');
		langBtn.type = 'button';
		langBtn.className = 'vsword-code-lang-btn';
		langBtn.dataset.action = 'lang';
		langBtn.title = '设置语言';
		langBtn.textContent = labelForLang(node.attrs.language);
		langBtn.addEventListener('mousedown', ev => { ev.preventDefault(); ev.stopPropagation(); });

		const copyBtn = doc.createElement('button');
		copyBtn.type = 'button';
		copyBtn.className = 'vsword-code-copy-btn';
		copyBtn.dataset.action = 'copy';
		copyBtn.title = '复制代码';
		copyBtn.textContent = '复制';
		copyBtn.addEventListener('mousedown', ev => { ev.preventDefault(); ev.stopPropagation(); });

		chrome.append(langBtn, copyBtn);
		wrap.append(chrome, pre);

		let openPop = null;

		function closePop() {
			if (openPop) { openPop.remove(); openPop = null; }
		}

		function commitLang(nextRaw) {
			closePop();
			if (nextRaw === null) return; // cancelled
			const pos = getPos();
			if (typeof pos !== 'number') return;
			const cur = view.state.doc.nodeAt(pos);
			if (!cur || cur.type.name !== 'code_block') return;
			const next = normalizeLangKey(nextRaw);
			if (next === normalizeLangKey(cur.attrs.language)) { view.focus(); return; }
			const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, language: next });
			view.dispatch(tr);
			view.focus();
		}

		langBtn.addEventListener('click', ev => {
			ev.preventDefault(); ev.stopPropagation();
			if (openPop) { closePop(); return; }
			const pos = getPos();
			if (typeof pos !== 'number') return;
			const cur = view.state.doc.nodeAt(pos);
			const currentLang = cur ? cur.attrs.language : '';
			openPop = buildPickerPopover(doc, currentLang, commitLang);
			chrome.appendChild(openPop);
		});

		let copyResetTimer = null;
		copyBtn.addEventListener('click', ev => {
			ev.preventDefault(); ev.stopPropagation();
			const pos = getPos();
			if (typeof pos !== 'number') return;
			const cur = view.state.doc.nodeAt(pos);
			if (!cur) return;
			const text = cur.textContent;
			const ok = copyText(doc, text);
			copyBtn.textContent = ok ? '已复制' : '复制失败';
			copyBtn.dataset.state = ok ? 'ok' : 'error';
			if (copyResetTimer) clearTimeout(copyResetTimer);
			copyResetTimer = setTimeout(() => {
				copyBtn.textContent = '复制';
				copyBtn.removeAttribute('data-state');
			}, 1500);
		});

		// Outside-click closes picker.
		const outside = ev => {
			if (!openPop) return;
			if (!chrome.contains(ev.target)) closePop();
		};
		doc.addEventListener('mousedown', outside, true);

		return {
			dom: wrap,
			contentDOM: codeEl,
			update(next) {
				if (next.type.name !== 'code_block') return false;
				// T-3.5b.2: language 从/到 mermaid 的切换 → 交回 PM 重建 NodeView。
				const wasMermaid = (node.attrs.language || '') === 'mermaid';
				const isMermaid = (next.attrs.language || '') === 'mermaid';
				if (wasMermaid !== isMermaid) return false;
				// T-3.5b-flow.2: language 从/到 flow 的切换同款处理。
					const wasFlow = (node.attrs.language || '') === 'flow';
					const isFlow = (next.attrs.language || '') === 'flow';
					if (wasFlow !== isFlow) return false;
					// T-3.5b-seq.2: language 从/到 sequence 的切换同款处理。
					const wasSeq = (node.attrs.language || '') === 'sequence';
					const isSeq = (next.attrs.language || '') === 'sequence';
					if (wasSeq !== isSeq) return false;
				langBtn.textContent = labelForLang(next.attrs.language);
				return true;
			},
			ignoreMutation(mutation) {
				// PM only cares about mutations inside <code>. Everything else
				// (chrome buttons, popover open/close, copy state toggle) must
				// be hidden from PM.
				return !codeEl.contains(mutation.target);
			},
			destroy() {
				doc.removeEventListener('mousedown', outside, true);
				closePop();
				if (copyResetTimer) clearTimeout(copyResetTimer);
			},
		};
	};
}

export const codeBlockChromeView = $view(codeBlockSchema.node, codeBlockNodeViewFactory);

// -----------------------------------------------------------------------------
// Keymap: Tab / Shift-Tab (真 Tab, per Q5=b) + Ctrl-Enter 跳出 (Q6=a).
// $prose is the right shape here because we need to inspect the selection
// state to gate on code_block scope.
// -----------------------------------------------------------------------------

function isInCodeBlock(state) {
	const $head = state.selection.$head;
	for (let d = $head.depth; d >= 0; d--) {
		if ($head.node(d).type.name === 'code_block') return true;
	}
	return false;
}

export const codeBlockKeymapPlugin = $prose(() => new Plugin({
	key: new PluginKey('VSWORD_CODEBLOCK_KEYMAP'),
	props: {
		handleKeyDown(view, event) {
			const { state, dispatch } = view;
			if (!isInCodeBlock(state)) return false;

			// Ctrl-Enter / Cmd-Enter → exit code block: insert paragraph AFTER
			// the enclosing code_block and move cursor there.
			if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
				event.preventDefault();
				const $head = state.selection.$head;
				let depth = $head.depth;
				while (depth >= 0 && $head.node(depth).type.name !== 'code_block') depth--;
				if (depth < 0) return false;
				const afterCodeBlock = $head.after(depth);
				const paragraphType = state.schema.nodes.paragraph;
				if (!paragraphType) return false;
				const tr = state.tr.insert(afterCodeBlock, paragraphType.create());
				// Selection placed inside the fresh paragraph.
				const Sel = state.selection.constructor;
				tr.setSelection(Sel.near(tr.doc.resolve(afterCodeBlock + 1)));
				dispatch(tr.scrollIntoView());
				return true;
			}

			// Tab / Shift-Tab → indent / outdent with a real tab character.
			if (event.key === 'Tab') {
				event.preventDefault();
				const { from, to, empty } = state.selection;
				if (event.shiftKey) {
					// Outdent: if the character immediately before the cursor is
					// a tab, drop it. (Collapsed selection only; range outdent
					// is deferred — Typora also only does single-line here.)
					if (!empty) return true;
					const before = state.doc.textBetween(Math.max(0, from - 1), from);
					if (before === '\t') {
						dispatch(state.tr.delete(from - 1, from));
					}
					return true;
				}
				// Indent: insert one tab (Q5=b real tab, not spaces).
				const tr = state.tr.insertText('\t', from, to);
				dispatch(tr);
				return true;
			}

			return false;
		},
	},
}));

export const codeBlockChromePlugins = [
	codeBlockChromeView,
	codeBlockKeymapPlugin,
];
