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
		// 保证 label 非空：空标题仍显示占位，避免 Outline 只剩图标/##
		headings.push({ id, text: text || `(H${level})`, level, pos });
		return false; // headings have no nested headings.
	});
	return headings;
}

/**
 * RD-1.4 / Outline：从**完整 markdown 源码**扫 ATX 标题（跳过 fence）。
 * 用于按需加载时仍展示「全文目录」；pos 为源码字符偏移（非 PM pos）。
 * 点击跳转时由 webview 按 text+level 在 PM 中解析，必要时先 load 后续 chunk。
 *
 * @param {string} md
 * @returns {Array<{id: string, text: string, level: number, pos: number}>}
 */
export function extractHeadingsFromMarkdownSource(md) {
	const headings = [];
	if (typeof md !== 'string' || md.length === 0) return headings;

	const seenSlugs = new Map();
	let inFence = false;
	let fenceMarker = '';
	let offset = 0;
	// 保留换行，offset 与源码字符位置对齐
	const lines = md.split(/(\r\n|\n|\r)/);

	for (let i = 0; i < lines.length; i++) {
		const part = lines[i];
		const isEol = part === '\n' || part === '\r' || part === '\r\n';
		if (isEol) {
			offset += part.length;
			continue;
		}
		const line = part;
		const lineStart = offset;
		offset += line.length;

		const trimmed = line.trimStart();
		// fenced code：``` / ~~~
		const fenceOpen = trimmed.match(/^(`{3,}|~{3,})/);
		if (fenceOpen) {
			const marker = fenceOpen[1][0];
			const run = fenceOpen[1];
			if (!inFence) {
				inFence = true;
				fenceMarker = run;
			} else if (trimmed.startsWith(fenceMarker[0].repeat(3))) {
				inFence = false;
				fenceMarker = '';
			}
			continue;
		}
		if (inFence) continue;

		// ATX: ## Title  /  ## Title ##
		const m = line.match(/^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/);
		if (!m) continue;
		const level = m[1].length;
		const text = (m[2] || '').trim();
		if (!text) continue;
		const baseSlug = slugify(text) || `h${level}`;
		const count = seenSlugs.get(baseSlug) ?? 0;
		seenSlugs.set(baseSlug, count + 1);
		const id = count === 0 ? baseSlug : `${baseSlug}-${count}`;
		headings.push({ id, text, level, pos: lineStart });
	}
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
