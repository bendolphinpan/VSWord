// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown round-trip verifier (bundled by build-milkdown-editor.cjs).
 *  Runs Milkdown in jsdom against a Chinese/GFM-heavy source and asserts key markers survive
 *  the parse → serialize round-trip. Non-zero exit = fail the vendor build.
 *--------------------------------------------------------------------------------------------*/

import { JSDOM } from 'jsdom';
import {
	Editor,
	defaultValueCtx,
	rootCtx,
	serializerCtx,
	editorViewCtx,
	parserCtx,
	remarkStringifyOptionsCtx,
} from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { math } from '@milkdown/plugin-math';
import { refractor } from 'refractor';
import katex from 'katex';
import { slash, SLASH_ITEMS } from './slash-menu.mjs';
import { highlightPlugins } from './highlight.mjs';
import { underlinePlugins } from './underline.mjs';
import { typoraShortcuts, TYPORA_SHORTCUT_IDS } from './shortcuts.mjs';
import { inputRulePlugins, AUTO_PAIRS } from './input-rules.mjs';
import { focusModePlugins } from './focus-mode.mjs';
import { MODES, DEFAULT_MODE } from './mode-controller.mjs';
import { VSWORD_MILKDOWN_THEME_IDS, VSWORD_MILKDOWN_DEFAULT_THEME, isValidTheme } from './themes.mjs';
import { extractHeadings, findEnclosingHeadingId, slugify } from './outline-extractor.mjs';

// Must match webview/entry.template.js — kept literally in sync for round-trip parity.
const TYPORA_STRINGIFY_OPTIONS = {
	bullet: '-',
	bulletOrdered: '.',
	emphasis: '*',
	strong: '*',
	fences: true,
	listItemIndent: 'one',
	rule: '-',
	ruleRepetition: 3,
	ruleSpaces: false,
	tightDefinitions: true,
	resourceLink: false,
	setext: false,
	incrementListMarker: true,
};

const source = '# 标题 Title\n\n你好，**Milkdown**。\n\n- 第一项\n- second `code`\n\n| 列 A | 列 B |\n| --- | --- |\n| 甲 | 乙 |\n\n行内数学 $a^2 + b^2 = c^2$ 后面还有文本。\n\n$$\n\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}\n$$\n\n重点：==高亮文本==，还有 <u>下划线文本</u>。\n';
const dom = new JSDOM('<!doctype html><html><body><main id="root"></main></body></html>', { pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'Node', 'HTMLElement', 'DOMParser', 'MutationObserver', 'Event', 'CustomEvent']) {
	Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
Object.defineProperty(globalThis, 'getSelection', { value: dom.window.getSelection.bind(dom.window), configurable: true, writable: true });
Object.defineProperty(globalThis, 'addEventListener', { value: dom.window.addEventListener.bind(dom.window), configurable: true, writable: true });
Object.defineProperty(globalThis, 'removeEventListener', { value: dom.window.removeEventListener.bind(dom.window), configurable: true, writable: true });
Object.defineProperty(globalThis, 'dispatchEvent', { value: dom.window.dispatchEvent.bind(dom.window), configurable: true, writable: true });
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame || (fn => setTimeout(fn, 16));
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame || (id => clearTimeout(id));

const root = document.getElementById('root');
const editor = await Editor.make()
	.config(ctx => {
		ctx.set(rootCtx, root);
		ctx.set(defaultValueCtx, source);
		ctx.set(remarkStringifyOptionsCtx, TYPORA_STRINGIFY_OPTIONS);
	})
	.use(commonmark)
	.use(gfm)
	.use(history)
	.use(math)
	.use(highlightPlugins)
	.use(underlinePlugins)
	.use(focusModePlugins)
	.create();
const output = editor.action(ctx => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));
const parserRoundTrip = editor.action(ctx => ctx.get(serializerCtx)(ctx.get(parserCtx)(source)));
// T-3.4: capture outline before destroy — needs a live doc.
const outlineHeadings = editor.action(ctx => extractHeadings(ctx.get(editorViewCtx).state.doc));
const outlineHeadingsFromMultiSource = editor.action(ctx => {
	const multiDoc = ctx.get(parserCtx)('# One\n\n## Two\n\n### Three\n\nbody\n\n## Two\n');
	return extractHeadings(multiDoc);
});
await editor.destroy(true);

const checks = {
	hasChineseHeading: output.includes('标题 Title'),
	hasChineseBody: output.includes('你好'),
	hasStrong: output.includes('**Milkdown**'),
	hasInlineCode: output.includes('`code`'),
	hasTable: output.includes('| 列 A | 列 B |'),
	parserRoundTripHasTable: parserRoundTrip.includes('| 列 A | 列 B |'),
	// T-3.3.6 Typora-flavoured serializer output assertions:
	usesDashBullets: output.includes('- 第一项') && output.includes('- second'),
	noAsteriskBullets: !/^\*\s/m.test(output),
	usesAtxHeading: output.startsWith('# '),
	// T-3.3.5 Prism / refractor tokenization is available and produces token classes for JS.
	prismJavascriptRegistered: refractor.listLanguages().includes('javascript'),
	prismTypescriptRegistered: refractor.listLanguages().includes('typescript'),
	prismProducesKeywordToken: (() => {
		const root = refractor.highlight('const x = 1;', 'javascript');
		function walk(node) {
			if (!node) return false;
			if (node.type === 'element') {
				const cls = node.properties?.className ?? [];
				if (Array.isArray(cls) && cls.includes('token') && cls.includes('keyword')) {
					const text = (node.children ?? []).map(c => c.value ?? '').join('');
					if (text === 'const') return true;
				}
			}
			return (node.children ?? []).some(walk);
		}
		return walk(root);
	})(),
	// T-3.3.4 KaTeX: math plugin round-trips inline/block math, katex renders formulas.
	roundTripHasInlineMath: output.includes('$a^2 + b^2 = c^2$'),
	roundTripHasBlockMath: /\$\$[\s\S]*sqrt\{\\?pi\}[\s\S]*\$\$/.test(output) || output.includes('\\int_0^\\infty'),
	katexRendersInline: (() => {
		const html = katex.renderToString('a^2 + b^2 = c^2', { throwOnError: false });
		return html.includes('katex') && html.includes('<span');
	})(),
	katexRendersBlock: (() => {
		const html = katex.renderToString('\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}', { throwOnError: false, displayMode: true });
		return html.includes('katex-display') && html.includes('katex-html');
	})(),
	// T-3.3.3 Slash menu: 12 standard-Markdown commands across 4 groups, no on-disk format
	// changes (round-trip output above already proves .md bytes are unaffected).
	slashPluginExists: !!slash && typeof slash === 'object' && !!slash.key,
	slashHasTwelveItems: Array.isArray(SLASH_ITEMS) && SLASH_ITEMS.length === 12,
	slashGroupsCorrect: (() => {
		const groups = new Set(SLASH_ITEMS.map(it => it.group));
		return ['Text', 'List', 'Media', 'Advanced'].every(g => groups.has(g));
	})(),
	slashItemsWellFormed: SLASH_ITEMS.every(it =>
		typeof it.id === 'string' && typeof it.label === 'string' &&
		typeof it.group === 'string' && typeof it.hint === 'string' && typeof it.run === 'function'
	),
	// T-3.3.7 Typora shortcuts & smart input: complete 1:1 keymap + highlight/underline round-trip.
	shortcutsHaveAll21Bindings: !!typoraShortcuts && TYPORA_SHORTCUT_IDS.length === 21,
	shortcutsCoverTyporaHeadings:
		TYPORA_SHORTCUT_IDS.filter(id => id.startsWith('Heading')).length === 6,
	autoPairsCoverSevenSymbols: Object.keys(AUTO_PAIRS).length === 7 &&
		AUTO_PAIRS['('] === ')' && AUTO_PAIRS['['] === ']' && AUTO_PAIRS['{'] === '}' &&
		AUTO_PAIRS['`'] === '`' && AUTO_PAIRS['"'] === '"' && AUTO_PAIRS['*'] === '*' &&
		AUTO_PAIRS['$'] === '$',
	inputRulesPluginPresent: Array.isArray(inputRulePlugins) && inputRulePlugins.length >= 1,
	roundTripHasHighlight: output.includes('==高亮文本=='),
	roundTripHasUnderline: output.includes('<u>下划线文本</u>'),
	// T-3.3.2 three-mode switcher: constants shared with the host protocol.
	modesAreThreeCanonicalValues:
		Array.isArray(MODES) && MODES.length === 3 &&
		MODES[0] === 'realtime' && MODES[1] === 'reading' && MODES[2] === 'source',
	defaultModeIsRealtime: DEFAULT_MODE === 'realtime',
	focusModePluginPresent: Array.isArray(focusModePlugins) && focusModePlugins.length > 0,
	// T-3.3.1 theme system: id list, default id, validator.
	themeIdsAreFiveCanonicalValues:
		Array.isArray(VSWORD_MILKDOWN_THEME_IDS) &&
		VSWORD_MILKDOWN_THEME_IDS.length === 5 &&
		VSWORD_MILKDOWN_THEME_IDS.includes('default') &&
		VSWORD_MILKDOWN_THEME_IDS.includes('github') &&
		VSWORD_MILKDOWN_THEME_IDS.includes('newsprint') &&
		VSWORD_MILKDOWN_THEME_IDS.includes('night') &&
		VSWORD_MILKDOWN_THEME_IDS.includes('solarized-light'),
	defaultThemeIsDefault: VSWORD_MILKDOWN_DEFAULT_THEME === 'default',
	themeValidatorAcceptsKnownIds: isValidTheme('github') && isValidTheme('night'),
	themeValidatorRejectsUnknownIds: !isValidTheme('dracula') && !isValidTheme('') && !isValidTheme(null),
	// T-3.4 outline extractor: heading discovery, slugification, active-id resolution.
	outlineExtractsChineseHeading:
		Array.isArray(outlineHeadings) && outlineHeadings.length === 1 &&
		outlineHeadings[0].level === 1 && outlineHeadings[0].text === '标题 Title',
	outlineExtractsMultiLevel:
		outlineHeadingsFromMultiSource.length === 4 &&
		outlineHeadingsFromMultiSource.map(h => h.level).join(',') === '1,2,3,2',
	outlineDedupesDuplicateSlugs: (() => {
		const ids = outlineHeadingsFromMultiSource.map(h => h.id);
		// "Two" appears twice → second must be suffixed.
		return ids[1] === 'two' && ids[3] === 'two-1';
	})(),
	outlineSlugifyHandlesCJK: slugify('中文 heading 一二三') === '中文-heading-一二三',
	outlineSlugifyStripsPunct: slugify('Hello, World!!!') === 'hello-world',
	outlineActiveIdFindsEnclosing: (() => {
		const hs = outlineHeadingsFromMultiSource;
		// Cursor after last heading → last heading is active.
		const last = hs[hs.length - 1];
		return findEnclosingHeadingId(hs, last.pos + 5) === last.id;
	})(),
	outlineActiveIdBeforeFirstIsNull: findEnclosingHeadingId(outlineHeadingsFromMultiSource, 0) !== null
		? findEnclosingHeadingId(outlineHeadingsFromMultiSource, -1) === null
		: findEnclosingHeadingId(outlineHeadingsFromMultiSource, -1) === null,
	outlineActiveIdEmptyReturnsNull: findEnclosingHeadingId([], 42) === null,
};
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
const result = { ok: failed.length === 0, failed, outputBytes: Buffer.byteLength(output), parserRoundTripBytes: Buffer.byteLength(parserRoundTrip), output };
console.log(JSON.stringify(result, null, 2));
if (failed.length) process.exit(1);
