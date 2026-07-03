// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.11.1 — wiki-link inline atom.
//
// Data path:
//   parse:  [[target|alias]]  --(vswordRemarkWikilink visitor)--> mdast { type:'wikilink', target, alias }
//           --(schema.parseMarkdown)-->                            PM node 'wikilink' (atom, inline)
//   write:  PM node 'wikilink'
//           --(schema.toMarkdown → mdast 'wikilink')-->
//           --(vswordRemarkWikilink stringify handler)-->          [[target|alias]]
//
// NodeView (T-3.11.1):
//   Renders `<a class="vsword-wikilink" data-target=…>alias|target</a>`.
//   Click posts {type:'openWikilink', target, newSplit} to host.
//   Resolution status (found/missing/ambiguous/pending) drives CSS class via helpers.

import { $nodeSchema, $remark, $inputRule } from '@milkdown/utils';
import { InputRule } from '@milkdown/prose/inputrules';
import { visit } from 'unist-util-visit';
import { onWikilinkHoverEnter, onWikilinkHoverLeave } from './wikilink-preview.mjs';
import {
	WIKILINK_RE,
	parseAll,
	normalizeTarget,
	normalizeAlias,
	displayFor,
	toMarkdown,
	classForStatus,
	titleForStatus,
} from './wikilink-helpers.mjs';

// ---------------------------------------------------------------------------
// Client-side resolution cache
// ---------------------------------------------------------------------------
// The webview never has the workspace file index directly — it asks the host.
// We cache resolutions by (lower-cased) target so we don't ping the host for
// every re-render. `invalidateWikilinkCache()` blows the cache and repaints;
// used when the host tells us "workspace changed".

const _cache = new Map();  // target(lower) -> { status, file? }
const _pending = new Set(); // targets currently in-flight
const _repaintHooks = new Set(); // NodeView-registered repaint callbacks

function cacheGet(target) {
	return _cache.get(target.toLowerCase()) || null;
}

function cacheSet(target, entry) {
	_cache.set(target.toLowerCase(), entry);
}

/** Called from entry.template.js when a host resolveResponse arrives. */
export function ingestResolutions(list) {
	if (!Array.isArray(list)) return;
	for (const r of list) {
		if (!r || typeof r.target !== 'string') continue;
		cacheSet(r.target, { status: r.status, file: r.file || null });
		_pending.delete(r.target.toLowerCase());
	}
	for (const hook of _repaintHooks) {
		try { hook(); } catch { /* NodeView disposed */ }
	}
}

/** Called when the workspace changes; drops the cache and re-requests all live links. */
export function invalidateWikilinkCache() {
	_cache.clear();
	_pending.clear();
	for (const hook of _repaintHooks) {
		try { hook(); } catch { /* */ }
	}
}

/** Request resolution for one target from the host if not already cached/pending. */
function requestResolution(target, vscode) {
	if (!vscode || !vscode.postMessage) return;
	const key = target.toLowerCase();
	if (_cache.has(key) || _pending.has(key)) return;
	_pending.add(key);
	vscode.postMessage({ type: 'wikilinkResolveRequest', target });
}

// ---------------------------------------------------------------------------
// remark plugin: parse + stringify
// ---------------------------------------------------------------------------

function vswordRemarkWikilink() {
	const data = this.data();
	const toMarkdownExtensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
	toMarkdownExtensions.push({
		handlers: {
			wikilink(node) {
				return toMarkdown(node.target, node.alias);
			},
		},
		unsafe: [{ character: '[', inConstruct: ['phrasing'] }],
	});

	return tree => {
		visit(tree, 'text', (node, index, parent) => {
			if (!parent || typeof index !== 'number') return;
			const links = parseAll(node.value);
			if (links.length === 0) return;
			const out = [];
			let cursor = 0;
			for (const l of links) {
				if (l.start > cursor) out.push({ type: 'text', value: node.value.slice(cursor, l.start) });
				out.push({ type: 'wikilink', target: l.target, alias: l.alias });
				cursor = l.end;
			}
			if (cursor < node.value.length) out.push({ type: 'text', value: node.value.slice(cursor) });
			parent.children.splice(index, 1, ...out);
			return index + out.length;
		});
	};
}

export const remarkWikilink = $remark('vsword-remark-wikilink', () => vswordRemarkWikilink, {});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const wikilinkSchema = $nodeSchema('wikilink', () => ({
	group: 'inline',
	inline: true,
	atom: true,
	attrs: {
		target: { default: '' },
		alias:  { default: null },
	},
	parseDOM: [{
		tag: 'a.vsword-wikilink',
		getAttrs: (dom) => ({
			target: dom.getAttribute('data-target') || '',
			alias:  dom.getAttribute('data-alias') || null,
		}),
	}],
	toDOM: (node) => ['a', {
		'class': 'vsword-wikilink vsword-wikilink-pending',
		'data-target': node.attrs.target,
		'data-alias':  node.attrs.alias || '',
		'contenteditable': 'false',
		'href': '#',
	}, displayFor(node.attrs)],
	parseMarkdown: {
		match: node => node.type === 'wikilink',
		runner: (state, node, type) => {
			state.addNode(type, {
				target: normalizeTarget(node.target),
				alias:  normalizeAlias(node.alias),
			});
		},
	},
	toMarkdown: {
		match: node => node.type.name === 'wikilink',
		runner: (state, node) => {
			state.addNode('wikilink', undefined, undefined, {
				target: node.attrs.target,
				alias:  node.attrs.alias,
			});
		},
	},
}));

// ---------------------------------------------------------------------------
// NodeView (Q1=c: cache-aware; posts resolveRequest; repaints on ingest)
// ---------------------------------------------------------------------------

function createWikilinkNodeView(vscode) {
	return (node, view, getPos) => {
		const dom = document.createElement('a');
		dom.setAttribute('contenteditable', 'false');
		dom.setAttribute('href', '#');
		dom.dataset.target = node.attrs.target;
		if (node.attrs.alias) dom.dataset.alias = node.attrs.alias;

		let currentTarget = node.attrs.target;

		const paint = () => {
			const cached = cacheGet(currentTarget);
			const status = cached ? cached.status : 'pending';
			const file = cached ? cached.file : null;
			dom.className = classForStatus(status);
			dom.title = titleForStatus(status, currentTarget, file);
			dom.textContent = displayFor({ target: currentTarget, alias: node.attrs.alias });
		};

		paint();
		requestResolution(currentTarget, vscode);
		_repaintHooks.add(paint);

		dom.addEventListener('click', (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			if (!vscode || !vscode.postMessage) return;
			vscode.postMessage({
				type: 'openWikilink',
				target: currentTarget,
				alias: node.attrs.alias || null,
				newSplit: !!(ev.ctrlKey || ev.metaKey),
			});
		});

		// T-3.11.3 · hover preview intent. Only fire for resolved (found) links —
		// pending/missing/ambiguous have nothing worth showing.
		dom.addEventListener('mouseenter', () => {
			const cached = cacheGet(currentTarget);
			if (!cached || cached.status !== 'found') return;
			onWikilinkHoverEnter({ target: currentTarget, alias: node.attrs.alias || null });
		});
		dom.addEventListener('mouseleave', () => {
			onWikilinkHoverLeave();
		});

		return {
			dom,
			update(newNode) {
				if (newNode.type.name !== 'wikilink') return false;
				if (newNode.attrs.target !== currentTarget || newNode.attrs.alias !== node.attrs.alias) {
					currentTarget = newNode.attrs.target;
					node = newNode;
					paint();
					requestResolution(currentTarget, vscode);
				}
				return true;
			},
			selectNode() { dom.classList.add('vsword-wikilink-selected'); },
			deselectNode() { dom.classList.remove('vsword-wikilink-selected'); },
			ignoreMutation() { return true; },
			destroy() { _repaintHooks.delete(paint); },
		};
	};
}

// A tiny wrapper $view — the vscode handle comes from a ctx slot we set up below.
import { $view, $ctx } from '@milkdown/utils';

/** Ctx slot for the vscode postMessage handle (set once at boot). */
export const wikilinkHostCtx = $ctx({ vscode: null }, 'vswordWikilinkHost');

export function configureWikilinkHost(ctx, vscode) {
	ctx.set(wikilinkHostCtx.key, { vscode });
}

export const wikilinkView = $view(wikilinkSchema.node, (ctx) => {
	const bag = ctx.get(wikilinkHostCtx.key);
	return createWikilinkNodeView(bag && bag.vscode);
});

// ---------------------------------------------------------------------------
// InputRule: typing `[[target]]` or `[[target|alias]]` commits the atom node.
// ---------------------------------------------------------------------------

export const wikilinkInputRule = $inputRule((ctx) => {
	const type = wikilinkSchema.type(ctx);
	// Trailing `]]` fires the rule; text before must match one wikilink shape.
	return new InputRule(/(?<!\\)\[\[([^\[\]\|\n]+?)(?:\|([^\[\]\n]+?))?\]\]$/, (state, match, start, end) => {
		const target = normalizeTarget(match[1]);
		if (!target) return null;
		const alias = normalizeAlias(match[2]);
		return state.tr.replaceWith(start, end, type.create({ target, alias }));
	});
});

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

export const wikilinkPlugins = [
	remarkWikilink,
	wikilinkSchema,
	wikilinkHostCtx,
	wikilinkView,
	wikilinkInputRule,
].flat();
