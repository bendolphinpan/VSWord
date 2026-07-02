// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown outline extractor (T-3.4).
 *
 *  Reads the current ProseMirror document and produces a flat list of headings with
 *  { id, text, level, pos } used by the host-side Outline adapter to build the tree.
 *
 *  `pos` is a ProseMirror document offset — the host round-trips it back via `reveal`
 *  so the webview can restore selection + scroll on click.
 *
 *  Kept as a template.js (copied into .tmp/ by build-milkdown-editor.cjs) so the workspace
 *  TS build does not try to type-check Milkdown's runtime schema shape.
 *--------------------------------------------------------------------------------------------*/

/**
 * Extract headings from a ProseMirror doc node.
 * @param {import('@milkdown/prose/model').Node} doc — ProseMirror root node.
 * @returns {Array<{id: string, text: string, level: number, pos: number}>}
 */
export function extractHeadings(doc) {
	const headings = [];
	if (!doc || typeof doc.descendants !== 'function') return headings;
	const seenSlugs = new Map();
	doc.descendants((node, pos) => {
		if (node.type?.name !== 'heading') return true;
		const text = (node.textContent || '').trim();
		const level = Number(node.attrs?.level) || 1;
		const baseSlug = slugify(text) || `h${level}`;
		const count = seenSlugs.get(baseSlug) ?? 0;
		seenSlugs.set(baseSlug, count + 1);
		const id = count === 0 ? baseSlug : `${baseSlug}-${count}`;
		headings.push({ id, text, level, pos });
		return false; // headings have no nested headings.
	});
	return headings;
}

/**
 * Given a heading list and a ProseMirror doc position (e.g. cursor.head),
 * return the id of the enclosing heading, or null if before the first heading.
 * "Enclosing" = the last heading whose pos <= target.
 */
export function findEnclosingHeadingId(headings, targetPos) {
	if (!Array.isArray(headings) || headings.length === 0) return null;
	let candidate = null;
	for (const h of headings) {
		if (h.pos <= targetPos) candidate = h;
		else break;
	}
	return candidate ? candidate.id : null;
}

/**
 * GitHub-style slug: lowercase, spaces → dashes, strip non-alphanumerics (keeping CJK).
 * Falls back gracefully on empty input.
 */
export function slugify(text) {
	if (typeof text !== 'string') return '';
	return text
		.toLowerCase()
		.trim()
		.replace(/[\s]+/g, '-')
		.replace(/[^\p{L}\p{N}\-_]/gu, '')
		.replace(/^-+|-+$/g, '')
		.slice(0, 120);
}
