/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * RD-7 · 用户字体三元组 Settings（决策 L-1）。
 *
 * 作用域仅限 Markdown WYSIWYG 正文 token（`--vsword-body-font/size/line`），
 * 不覆盖主题色 / 外挂 Typora CSS 其它变量，避免与 T-3.7d 主题冲突。
 *
 * 空 / 非法值 = 不覆盖（沿用当前主题 token）。
 */

export const VSWORD_TYPOGRAPHY_CONFIG = {
	fontFamily: 'vsword.markdown.fontFamily',
	fontSize: 'vsword.markdown.fontSize',
	lineHeight: 'vsword.markdown.lineHeight',
} as const;

/** Wire shape host → webview. */
export interface VswordTypographyPayload {
	/** CSS font-family 列表；空串 = 不覆盖主题 */
	readonly fontFamily: string;
	/** px，0 = 不覆盖；合法 10–36 */
	readonly fontSize: number;
	/** 无单位倍数，0 = 不覆盖；合法 1.0–3.0 */
	readonly lineHeight: number;
}

export const VSWORD_FONT_SIZE_MIN = 10;
export const VSWORD_FONT_SIZE_MAX = 36;
export const VSWORD_LINE_HEIGHT_MIN = 1.0;
export const VSWORD_LINE_HEIGHT_MAX = 3.0;

/**
 * 规范化 Settings 原始值。任何非法字段归零/空，调用方视作「不覆盖」。
 */
export function normalizeTypography(raw: {
	fontFamily?: unknown;
	fontSize?: unknown;
	lineHeight?: unknown;
}): VswordTypographyPayload {
	let fontFamily = '';
	if (typeof raw.fontFamily === 'string') {
		const t = raw.fontFamily.trim();
		// 拒绝过长 / 含控制字符；允许常见 CSS font-family 语法
		if (t.length > 0 && t.length <= 200 && !/[\u0000-\u001F\u007F]/.test(t)) {
			fontFamily = t;
		}
	}

	let fontSize = 0;
	if (typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize)) {
		const n = Math.round(raw.fontSize);
		if (n >= VSWORD_FONT_SIZE_MIN && n <= VSWORD_FONT_SIZE_MAX) {
			fontSize = n;
		}
	} else if (typeof raw.fontSize === 'string' && raw.fontSize.trim()) {
		const n = Math.round(Number(raw.fontSize));
		if (Number.isFinite(n) && n >= VSWORD_FONT_SIZE_MIN && n <= VSWORD_FONT_SIZE_MAX) {
			fontSize = n;
		}
	}

	let lineHeight = 0;
	if (typeof raw.lineHeight === 'number' && Number.isFinite(raw.lineHeight)) {
		const n = Math.round(raw.lineHeight * 100) / 100;
		if (n >= VSWORD_LINE_HEIGHT_MIN && n <= VSWORD_LINE_HEIGHT_MAX) {
			lineHeight = n;
		}
	} else if (typeof raw.lineHeight === 'string' && raw.lineHeight.trim()) {
		const n = Math.round(Number(raw.lineHeight) * 100) / 100;
		if (Number.isFinite(n) && n >= VSWORD_LINE_HEIGHT_MIN && n <= VSWORD_LINE_HEIGHT_MAX) {
			lineHeight = n;
		}
	}

	return { fontFamily, fontSize, lineHeight };
}

/**
 * 将 payload 写成 CSS 变量增量。
 * value 为 `null` 表示 removeProperty（回退主题）。
 */
export function typographyToCssVarUpdates(t: VswordTypographyPayload): {
	'--vsword-body-font': string | null;
	'--vsword-body-size': string | null;
	'--vsword-body-line': string | null;
} {
	return {
		'--vsword-body-font': t.fontFamily ? t.fontFamily : null,
		'--vsword-body-size': t.fontSize > 0 ? `${t.fontSize}px` : null,
		'--vsword-body-line': t.lineHeight > 0 ? String(t.lineHeight) : null,
	};
}
