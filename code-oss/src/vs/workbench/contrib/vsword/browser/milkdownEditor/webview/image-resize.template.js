// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  T-3.5.2: pure helpers for image resize — parse/render `<img>` tags and
 *  clamp/round resize math. Kept side-effect-free so the same functions drive
 *  the ProseMirror schema (parseMarkdown → PM attrs), the toMarkdown
 *  serializer (PM attrs → HTML string), the NodeView drag math, and the
 *  node-side unit tests.
 *
 *  Contract:
 *    - `width` is stored as an integer number of CSS pixels; unset (0) means
 *      "no explicit sizing" → serializer falls back to `![]()` short syntax.
 *    - Aspect ratio is ALWAYS locked (Q3=c but 不允许改比例). We never store
 *      `height` — the browser resolves it from the image's intrinsic aspect
 *      ratio, guaranteeing round-trip idempotence.
 *--------------------------------------------------------------------------------------------*/

/** Minimum resize width in px — anything smaller becomes unclickable. */
export const IMAGE_RESIZE_MIN_PX = 50;
/** Absolute safety cap so users can't wedge an image at 100000 px. */
export const IMAGE_RESIZE_MAX_PX = 4096;

/** Clamp + round a raw drag width into an integer inside [min, max ∧ container]. */
export function clampWidth(rawPx, containerPx) {
	const capped = Math.min(
		IMAGE_RESIZE_MAX_PX,
		containerPx && containerPx > IMAGE_RESIZE_MIN_PX ? containerPx : IMAGE_RESIZE_MAX_PX,
	);
	const bounded = Math.max(IMAGE_RESIZE_MIN_PX, Math.min(capped, Math.round(rawPx)));
	return Number.isFinite(bounded) ? bounded : IMAGE_RESIZE_MIN_PX;
}

/**
 * Which axis a handle drags on, and whether the handle is on the leading edge
 * (dragging left grows the image) or the trailing edge (dragging right grows).
 * All eight handles collapse to a signed dx applied to the current width;
 * height follows via the aspect-ratio lock.
 */
export const HANDLE_DIRECTIONS = Object.freeze({
	n:  { sign: 0 }, // top edge — no horizontal drag; ignore (aspect locked)
	s:  { sign: 0 }, // bottom edge — same as above
	e:  { sign: +1 }, // right edge
	w:  { sign: -1 }, // left edge
	ne: { sign: +1 },
	se: { sign: +1 },
	nw: { sign: -1 },
	sw: { sign: -1 },
});

/** Compute new width from a mousedown snapshot + current mousemove position. */
export function widthFromDrag(handle, startWidth, startX, currentX, containerPx) {
	const dir = HANDLE_DIRECTIONS[handle];
	if (!dir) return clampWidth(startWidth, containerPx);
	// n/s handles are inert under aspect lock — keep width steady so the user
	// gets visual feedback (no jitter) rather than a no-op.
	if (dir.sign === 0) return clampWidth(startWidth, containerPx);
	return clampWidth(startWidth + dir.sign * (currentX - startX), containerPx);
}

/** HTML-escape a value for safe insertion into an attribute. Bare-minimum, no deps. */
export function escapeAttr(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * Serialize PM `image` attrs (with our extra `width`) to an `<img>` tag.
 * Only emits `width` when it's a positive integer; that's how the schema
 * decides whether to use html or `![]()` in `toMarkdown`.
 */
export function renderImgTag(attrs) {
	const src   = escapeAttr(attrs?.src ?? '');
	const parts = [`src="${src}"`];
	if (attrs?.alt)   parts.push(`alt="${escapeAttr(attrs.alt)}"`);
	if (attrs?.title) parts.push(`title="${escapeAttr(attrs.title)}"`);
	if (Number.isFinite(attrs?.width) && attrs.width > 0) {
		parts.push(`width="${Math.round(attrs.width)}"`);
	}
	return `<img ${parts.join(' ')}>`;
}

// A permissive `<img …>` matcher — CommonMark passes raw html verbatim so we
// only see one tag at a time here. Anchored to `<img` to avoid matching random
// text that happens to contain the word.
const IMG_TAG_RE = /^\s*<img\b([^>]*?)\/?>\s*$/i;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/**
 * Parse an html-node value like `<img src="..." width="800" alt="…">` into
 * image-node attrs. Returns `null` if the value isn't a lone `<img>` tag; the
 * caller then leaves the html node alone and Milkdown treats it as opaque html.
 */
export function parseImgTag(value) {
	if (typeof value !== 'string') return null;
	const m = IMG_TAG_RE.exec(value);
	if (!m) return null;
	const attrs = { src: '', alt: '', title: '', width: 0 };
	ATTR_RE.lastIndex = 0;
	let a;
	while ((a = ATTR_RE.exec(m[1])) !== null) {
		const name = a[1].toLowerCase();
		const raw  = a[2] ?? a[3] ?? a[4] ?? '';
		if (name === 'src')   attrs.src   = decodeHtmlEntities(raw);
		else if (name === 'alt')   attrs.alt   = decodeHtmlEntities(raw);
		else if (name === 'title') attrs.title = decodeHtmlEntities(raw);
		else if (name === 'width') {
			const n = parseInt(raw, 10);
			if (Number.isFinite(n) && n > 0) attrs.width = n;
		}
	}
	if (!attrs.src) return null;
	return attrs;
}

const ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodeHtmlEntities(s) {
	return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, entity) => {
		if (entity.startsWith('#x') || entity.startsWith('#X')) {
			const cp = parseInt(entity.slice(2), 16);
			return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
		}
		if (entity.startsWith('#')) {
			const cp = parseInt(entity.slice(1), 10);
			return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
		}
		return ENTITY_MAP[entity.toLowerCase()] ?? _;
	});
}
