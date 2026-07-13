// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  RD-5.2 · Pretext 版心/行宽预演（方案 C）
 *
 *  - 纯函数：format / 估算（可单测，不依赖 Canvas）
 *  - lazyLoadPretext：dynamic import('@chenglou/pretext') → 独立 vendor chunk
 *  - measureLineCapacity：用「中」字 natural width 估算当前版心每行字数
 *--------------------------------------------------------------------------------------------*/

/** 采样用全角汉字（Pretext CJK 路径）。 */
export const VSWORD_MEASURE_CJK_SAMPLE = '中';

/**
 * @param {number} charsPerLine
 * @param {number} maxWidthPx
 * @returns {string}
 */
export function formatLineMeasureLabel(charsPerLine, maxWidthPx) {
	if (!Number.isFinite(charsPerLine) || charsPerLine <= 0) {
		return '';
	}
	if (!Number.isFinite(maxWidthPx) || maxWidthPx <= 0) {
		return '';
	}
	const n = Math.max(1, Math.round(charsPerLine));
	const w = Math.max(1, Math.round(maxWidthPx));
	return `约 ${n} 字/行 · 版心 ${w}px`;
}

/**
 * @param {number} maxWidthPx
 * @param {number} charWidthPx  单字 advance（如「中」）
 * @returns {number} 0 = 不可估
 */
export function estimateCharsPerLine(maxWidthPx, charWidthPx) {
	if (!Number.isFinite(maxWidthPx) || maxWidthPx <= 0) { return 0; }
	if (!Number.isFinite(charWidthPx) || charWidthPx <= 0) { return 0; }
	return maxWidthPx / charWidthPx;
}

/**
 * 从 CSS 像素字符串解析数值（如 "800px" / "12.5"）。
 * @param {string | null | undefined} raw
 * @param {number} [fallback=0]
 */
export function parseCssPx(raw, fallback = 0) {
	if (typeof raw !== 'string' || !raw.trim()) { return fallback; }
	const n = parseFloat(raw);
	return Number.isFinite(n) ? n : fallback;
}

/** @type {null | Promise<typeof import('@chenglou/pretext')>} */
let _pretextModPromise = null;

/**
 * Lazy 加载 Pretext（esbuild splitting → 独立 chunk）。
 * @returns {Promise<{ prepare: Function, prepareWithSegments: Function, measureNaturalWidth: Function, setLocale: Function, clearCache: Function } | null>}
 */
export function lazyLoadPretext() {
	if (!_pretextModPromise) {
		_pretextModPromise = import('@chenglou/pretext').then(mod => {
			try {
				if (typeof mod.setLocale === 'function') {
					mod.setLocale('zh-CN');
				}
			} catch { /* ignore */ }
			return mod;
		}).catch(err => {
			_pretextModPromise = null;
			throw err;
		});
	}
	return _pretextModPromise;
}

/**
 * @param {object} opts
 * @param {string} opts.font  CSS font shorthand
 * @param {number} opts.maxWidthPx
 * @param {typeof import('@chenglou/pretext') | null} [opts.mod]  已加载模块；缺省 lazy
 * @returns {Promise<{ charsPerLine: number, charWidthPx: number, maxWidthPx: number, label: string } | null>}
 */
export async function measureLineCapacity(opts) {
	const font = typeof opts?.font === 'string' ? opts.font.trim() : '';
	const maxWidthPx = Number(opts?.maxWidthPx);
	if (!font || !Number.isFinite(maxWidthPx) || maxWidthPx <= 0) {
		return null;
	}
	let mod = opts?.mod ?? null;
	if (!mod) {
		try {
			mod = await lazyLoadPretext();
		} catch {
			return null;
		}
	}
	if (!mod || typeof mod.prepareWithSegments !== 'function' || typeof mod.measureNaturalWidth !== 'function') {
		return null;
	}
	try {
		const prepared = mod.prepareWithSegments(VSWORD_MEASURE_CJK_SAMPLE, font);
		const charWidthPx = mod.measureNaturalWidth(prepared);
		const charsPerLine = estimateCharsPerLine(maxWidthPx, charWidthPx);
		if (charsPerLine <= 0) { return null; }
		return {
			charsPerLine,
			charWidthPx,
			maxWidthPx,
			label: formatLineMeasureLabel(charsPerLine, maxWidthPx),
		};
	} catch {
		return null;
	}
}

/**
 * 从编辑器 DOM 读取字体与版心宽。
 * @param {ParentNode | null | undefined} root  #milkdown-root 或 shell
 * @returns {{ font: string, maxWidthPx: number }}
 */
export function readMeasureContextFromDom(root) {
	const prose = root?.querySelector?.('.ProseMirror') || root;
	let font = '16px serif';
	let maxWidthPx = 800;
	try {
		if (prose && typeof getComputedStyle === 'function') {
			const cs = getComputedStyle(prose);
			if (cs.font) { font = cs.font; }
			// 正文实际排版宽优先 clientWidth；否则读主题 token
			if (prose.clientWidth > 40) {
				maxWidthPx = prose.clientWidth;
			} else {
				const shell = prose.closest?.('.vsword-md-shell') || document.body;
				const token = getComputedStyle(shell).getPropertyValue('--vsword-max-width');
				const fromToken = parseCssPx(token, 0);
				if (fromToken > 0) { maxWidthPx = fromToken; }
			}
		}
	} catch { /* ignore */ }
	return { font, maxWidthPx };
}
