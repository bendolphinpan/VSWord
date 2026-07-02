// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  T-3.5.2: override the built-in commonmark `image` schema so PM nodes can
 *  carry a `width` attribute, and add a $remark plugin that lifts standalone
 *  `<img …>` html mdast nodes back up to real `image` nodes on ingress.
 *
 *  Round-trip contract (paired with image-resize.mjs):
 *    - Markdown `![alt](src)` with no width → PM image { width: 0 } →
 *      serialize back to `![alt](src)` (short syntax, untouched).
 *    - Markdown raw html `<img src="..." width="800">` → the $remark lift
 *      rewrites the html mdast node to an image mdast node with data.width →
 *      PM image { width: 800 } → serialize back to `<img src="..." width="800">`.
 *    - PM image with width>0 that came from a resize drag → emit html so the
 *      width is preserved (`![]()` has no width slot in CommonMark).
 *
 *  Registration order note: `.use(commonmark).use(imageSchemaOverride)` — same
 *  id, later wins in Milkdown's plugin system. That's the pattern the typora
 *  shortcut plugin already uses in this codebase, so behaviour is proven.
 *--------------------------------------------------------------------------------------------*/

import { $nodeSchema, $remark } from '@milkdown/utils';
import { expectDomTypeError } from '@milkdown/exception';
import { visit } from 'unist-util-visit';

import { parseImgTag, renderImgTag } from './image-resize.mjs';

/** Same context attr as commonmark exposes (`imageAttr.key`) — read as `undefined`-safe. */
function readAttrs(ctx, node) {
	// We don't re-export imageAttr; instead we simply don't merge extra attrs
	// (the commonmark preset applies them at the DOM level via NodeView, and
	// we override that too — so no downstream style gets lost).
	return {};
}

export const imageSchemaOverride = $nodeSchema('image', (ctx) => ({
	inline: true,
	group: 'inline',
	selectable: true,
	draggable: true,
	marks: '',
	atom: true,
	defining: true,
	isolating: true,
	attrs: {
		src:   { default: '', validate: 'string' },
		alt:   { default: '', validate: 'string' },
		title: { default: '', validate: 'string' },
		// Extra: 0 means "no explicit sizing" — serialize as `![]()` short syntax.
		width: { default: 0, validate: 'number' },
	},
	parseDOM: [{
		tag: 'img[src]',
		getAttrs: (dom) => {
			if (!(dom instanceof HTMLElement)) throw expectDomTypeError(dom);
			const rawW = dom.getAttribute('width') || '';
			const w = parseInt(rawW, 10);
			return {
				src: dom.getAttribute('src') || '',
				alt: dom.getAttribute('alt') || '',
				title: dom.getAttribute('title') || dom.getAttribute('alt') || '',
				width: Number.isFinite(w) && w > 0 ? w : 0,
			};
		},
	}],
	toDOM: (node) => {
		const { src, alt, title, width } = node.attrs;
		const attrs = { ...readAttrs(ctx, node), src, alt, title };
		if (width > 0) attrs.width = String(width);
		return ['img', attrs];
	},
	parseMarkdown: {
		match: ({ type }) => type === 'image',
		runner: (state, node, type) => {
			state.addNode(type, {
				src: node.url ?? '',
				alt: node.alt ?? '',
				title: node.title ?? '',
				// Width is stashed on `data` by the html-lift plugin below.
				width: Number.isFinite(node.data?.width) && node.data.width > 0 ? node.data.width : 0,
			});
		},
	},
	toMarkdown: {
		match: (node) => node.type.name === 'image',
		runner: (state, node) => {
			const { src, alt, title, width } = node.attrs;
			if (Number.isFinite(width) && width > 0) {
				// Round-trip as raw HTML so the width slot survives; wrap in a
				// paragraph-inline html node — remark stringifies value verbatim.
				state.addNode('html', undefined, renderImgTag({ src, alt, title, width }));
			} else {
				state.addNode('image', undefined, undefined, { title, url: src, alt });
			}
		},
	},
}));

/**
 * Ingress-side remark plugin: rewrite standalone `<img>` html mdast nodes back
 * into image nodes so our PM schema can absorb the width attr. Runs before
 * Milkdown's mdast→PM stage, in the parse pipeline.
 *
 * Safe fallback: if `parseImgTag` returns null (malformed / not a lone <img>),
 * we leave the html node alone and Milkdown treats it as opaque html.
 */
export const remarkLiftImgHtmlPlugin = $remark('remark-lift-img-html', () => () => (tree) => {
	visit(tree, 'html', (node) => {
		const attrs = parseImgTag(node.value);
		if (!attrs) return;
		// Mutate in place — mdast nodes are plain JSON so this is safe.
		node.type = 'image';
		node.url = attrs.src;
		node.alt = attrs.alt;
		node.title = attrs.title || null;
		node.value = undefined;
		node.data = { ...(node.data || {}), width: attrs.width };
	});
});
