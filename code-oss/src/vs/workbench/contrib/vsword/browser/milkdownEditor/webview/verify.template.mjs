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
import { gfm, remarkGFMPlugin } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { math } from '@milkdown/plugin-math';
import { refractor } from 'refractor';
import katex from 'katex';
import { slash, SLASH_ITEMS } from './slash-menu.mjs';
import { highlightPlugins } from './highlight.mjs';
import { underlinePlugins } from './underline.mjs';
import { subSupPlugins } from './sub-sup.mjs';
import { emojiPlugins, resolveEmoji } from './emoji.mjs';
import { EMOJI_RE, parseInlineEmoji, stringifyEmoji, extractShortcodeName } from './emoji-helpers.mjs';
// T-3.5c.2: footnote round-trip + helpers.
import { footnotePlugins } from './footnote.mjs';
import {
	normalizeLabel,
	sanitizeLabelForSelector,
	mdastToPlainText,
	truncateForPreview,
	buildDefinitionIndex,
} from './footnote-helpers.mjs';
import {
	FootnoteHoverIntent,
	OPEN_DELAY_MS as FN_OPEN_DELAY_MS,
	CLOSE_DELAY_MS as FN_CLOSE_DELAY_MS,
} from './footnote-preview.mjs';
// T-3.5c.3: frontmatter round-trip + helpers.
import { frontmatterPlugins, FRONTMATTER_PARSERS } from './frontmatter.mjs';
import {
	FLAVORS,
	isValidFlavor,
	extractTopLevelKeys,
	summarizeFrontmatter,
	formatSummaryLabel,
	firstLineOfError,
	detectFrontmatterError,
	stripFence,
	addFence,
} from './frontmatter-helpers.mjs';
import { typoraShortcuts, TYPORA_SHORTCUT_IDS } from './shortcuts.mjs';
import { inputRulePlugins, AUTO_PAIRS } from './input-rules.mjs';
import { focusModePlugins } from './focus-mode.mjs';
import { MODES, DEFAULT_MODE } from './mode-controller.mjs';
import { VSWORD_MILKDOWN_THEME_IDS, VSWORD_MILKDOWN_DEFAULT_THEME, isValidTheme } from './themes.mjs';
import { extractHeadings, findEnclosingHeadingId, slugify } from './outline-extractor.mjs';
import { upload, uploadConfig, defaultUploader } from '@milkdown/plugin-upload';
import { createHostImageUploader, imageUploadPlugins } from './image-upload.mjs';
import { imageResizePlugins, normalizeAlt } from './image-node-view.mjs';
import { remarkLiftImgHtmlPlugin, imageSchemaOverride } from './image-schema-override.mjs';
import { codeBlockSchemaOverride } from './code-block-schema-override.mjs';
import { normalizeAlign, parseAlignWrapper, renderAlignedImg } from './image-resize.mjs';
import { clampWidth, widthFromDrag, parseImgTag, renderImgTag, IMAGE_RESIZE_MIN_PX, IMAGE_RESIZE_MAX_PX } from './image-resize.mjs';
// T-3.5b-flow.2: flowchart.js NodeView + helpers 断言。
import {
	getCodeBlockSource,
	flowchartIsEmpty,
	autoSizeTextareaPx,
	normalizeFlowchartSource,
	extractFlowchartError,
	formatErrorHeadline,
	parseErrorLineNumber,
	formatErrorStack,
	offsetOfLine,
	buildFlowchartOptions,
} from './flowchart-view-helpers.mjs';
// T-3.5b-seq.2: js-sequence-diagrams NodeView + helpers 断言。别名避免与 flowchart 同名冲突。
import {
	sequenceIsEmpty,
	normalizeSequenceSource,
	extractSequenceError,
	buildSequenceOptions,
	getCodeBlockSource as seqGetCodeBlockSource,
	autoSizeTextareaPx as seqAutoSizeTextareaPx,
	formatErrorHeadline as seqFormatErrorHeadline,
	parseErrorLineNumber as seqParseErrorLineNumber,
	formatErrorStack as seqFormatErrorStack,
	offsetOfLine as seqOffsetOfLine,
} from './sequence-view-helpers.mjs';

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

const source = '# 标题 Title\n\n你好，**Milkdown**。\n\n- 第一项\n- second `code`\n\n| 列 A | 列 B |\n| --- | --- |\n| 甲 | 乙 |\n\n| 姓名 | 年龄 | 地区 |\n| :--- | :---: | ---: |\n| 张三 | 30 | 北京 |\n| 李四 | 25 | 上海 |\n\n行内数学 $a^2 + b^2 = c^2$ 后面还有文本。\n\n$$\n\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}\n$$\n\n重点：==高亮文本==，还有 <u>下划线文本</u>。\n\n化学式 H~2~O 与 CO~2~，指数 x^2^ 和 e^n^。\n\n表情：:smile: 你好 :heart: 收工，未识别 :notarealemojiname: 保源码。\n\n引用有脚注[^1]，还有具名脚注[^note]，以及 CJK 标签[^中文标签]。\n\n[^1]: 第一条脚注定义。\n\n[^note]: 具名脚注 with **bold** and `code`。\n\n[^中文标签]: 中文标签的定义正文。\n\n![截图](assets/screenshot-1.png)\n\n![远程](https://example.com/pic.png)\n\n<img src="assets/wide.png" alt="宽图" width="640">\n\n![](assets/no-caption.png)\n\n![图 1: 带 \\[方括号\\] 的图注](assets/fig1.png)\n\n<p align="center"><img src="assets/hero.png" alt="居中大图"></p>\n\n<p align="right"><img src="assets/thumb.png" alt="右对齐" width="200"></p>\n\n```python\ndef greet(name):\n    return f"你好, {name}"\n```\n\n```\nno language here\n\ttab-indented line\n```\n\n```mermaid\ngraph LR\n    A --> B\n```\n\n```js {highlight-lines=[1,3]}\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```\n\n```ts {title="demo.ts" line-numbers}\nexport const x: number = 42;\n```\n';
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
		ctx.set(remarkGFMPlugin.options.key, { singleTilde: false });
	})
	.use(commonmark)
	.use(codeBlockSchemaOverride)
	.use(gfm)
	.use(history)
	.use(math)
	.use(highlightPlugins)
	.use(underlinePlugins)
	.use(subSupPlugins)
	.use(emojiPlugins)
	.use(footnotePlugins)
	.use(frontmatterPlugins)
	.use(focusModePlugins)
	.use(remarkLiftImgHtmlPlugin)
	.use(imageResizePlugins)
	.create();
const output = editor.action(ctx => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));
const parserRoundTrip = editor.action(ctx => ctx.get(serializerCtx)(ctx.get(parserCtx)(source)));
// T-3.4: capture outline before destroy — needs a live doc.
const outlineHeadings = editor.action(ctx => extractHeadings(ctx.get(editorViewCtx).state.doc));
const outlineHeadingsFromMultiSource = editor.action(ctx => {
	const multiDoc = ctx.get(parserCtx)('# One\n\n## Two\n\n### Three\n\nbody\n\n## Two\n');
	return extractHeadings(multiDoc);
});
// T-3.5c.3: frontmatter round-trip fixtures（8 类）。
// remark-frontmatter 的 stringifier 会补 trailing `\n`，所以 fixture 输入统一以 `\n` 收尾。
const FRONTMATTER_FIXTURES = [
	{ name: 'yaml-basic',    source: '---\ntitle: Hello\ntags: [a, b]\n---\n\n正文段落。\n' },
	{ name: 'yaml-quoted',   source: '---\ntitle: "带 : 冒号的标题"\ndesc: \'she said "hi"\'\n---\n\n引号 fixture。\n' },
	{ name: 'yaml-indent',   source: '---\nauthor:\n  name: 张三\n  email: z@example.com\ntags:\n  - alpha\n  - beta\n---\n\n嵌套结构。\n' },
	{ name: 'yaml-empty-val',source: '---\ntitle:\nauthor:\ndraft: true\n---\n\n空值 fixture。\n' },
	{ name: 'yaml-syntax-err', source: '---\ntitle: [unclosed\n---\n\n错误语法应该保源码写回。\n' },
	{ name: 'toml-basic',    source: '+++\ntitle = "Post"\ndate = 2026-01-01\ntags = ["a", "b"]\n+++\n\nTOML 段。\n' },
	{ name: 'json-legacy',   source: '# JSON frontmatter\n\n{ "title": "not-parsed-here" } 的行内 JSON 不算 frontmatter（F-16 未启用）。\n' },
	{ name: 'trailing-nl',   source: '---\ntitle: keep-trailing\n---\n\nend\n' },
];
const frontmatterFixtureResults = FRONTMATTER_FIXTURES.map(fx => {
	try {
		const rt = editor.action(ctx => ctx.get(serializerCtx)(ctx.get(parserCtx)(fx.source)));
		return { name: fx.name, ok: rt === fx.source, bytes: Buffer.byteLength(rt), diff: rt === fx.source ? null : rt };
	} catch (err) {
		return { name: fx.name, ok: false, error: String(err?.message || err) };
	}
});
const frontmatterRoundTripAllOk = frontmatterFixtureResults.every(r => r.ok);
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
	// T-3.5c.6 F-24：slash-menu 从 12 项扩到 15 项（+/emoji /footnote /frontmatter），新增 Syntax 组。
	slashHasFifteenItems: Array.isArray(SLASH_ITEMS) && SLASH_ITEMS.length === 15,
	slashGroupsCorrect: (() => {
		const groups = new Set(SLASH_ITEMS.map(it => it.group));
		return ['Text', 'List', 'Media', 'Advanced', 'Syntax'].every(g => groups.has(g));
	})(),
	slashItemsWellFormed: SLASH_ITEMS.every(it =>
		typeof it.id === 'string' && typeof it.label === 'string' &&
		typeof it.group === 'string' && typeof it.hint === 'string' && typeof it.run === 'function'
	),
	// F-24 三个新入口存在。
	slashHasEmojiEntry:       SLASH_ITEMS.some(it => it.id === 'emoji' && it.group === 'Syntax'),
	slashHasFootnoteEntry:    SLASH_ITEMS.some(it => it.id === 'footnote' && it.group === 'Syntax'),
	slashHasFrontmatterEntry: SLASH_ITEMS.some(it => it.id === 'frontmatter' && it.group === 'Syntax'),
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
	// T-3.5c.4 sub/sup：`~x~` / `^x^` 单波浪/单 caret 保源码；与 GFM strikethrough 不冲突。
	roundTripHasSubscriptH2O:     output.includes('H~2~O'),
	roundTripHasSubscriptCO2:     output.includes('CO~2~'),
	roundTripHasSuperscriptX2:    output.includes('x^2^'),
	roundTripHasSuperscriptEn:    output.includes('e^n^'),
	// 不得把 `~x~` 误当成 strikethrough 输出（GFM strike 会写 `~~x~~`）。
	subSupNoStrikeCollision:      !/~~[^~]+~~/.test(output),
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
	// T-3.5.1 image upload — plugin-upload shape + our host-backed integration.
	uploadBundleIsTwoPlugins: Array.isArray(upload) && upload.length === 2,
	uploadConfigHasKey: !!uploadConfig && !!uploadConfig.key && typeof uploadConfig.meta === 'object',
	defaultUploaderIsFunction: typeof defaultUploader === 'function',
	imageUploadPluginsExported: Array.isArray(imageUploadPlugins) && imageUploadPlugins.length === 2 && imageUploadPlugins === upload,
	createHostImageUploaderReturnsFn: typeof createHostImageUploader(null) === 'function',
	// Round-trip: relative + remote image links survive parse → serialize unchanged.
	roundTripHasRelativeImage: output.includes('![截图](assets/screenshot-1.png)'),
	roundTripHasRemoteImage: output.includes('![远程](https://example.com/pic.png)'),
	// The uploader factory returns an async fn matching the plugin-upload contract.
	uploaderContract: (async () => {
		const fn = createHostImageUploader(null);
		// Empty FileList — should resolve to empty array without touching vscode.
		const emptyList = { length: 0, item: () => null };
		const r = await fn(emptyList, { nodes: { image: { createAndFill: () => ({}) } } });
		return Array.isArray(r) && r.length === 0;
	})(),
	// T-3.5.2 image resize — schema override + html-lift + resize math.
	imageSchemaHasWidthAttr: !!imageSchemaOverride.node?.schema?.attrs && 'width' in imageSchemaOverride.node.schema.attrs,
	imageResizePluginsExported: Array.isArray(imageResizePlugins) && imageResizePlugins.length === 2,
	// Sized <img> HTML in source survives round-trip: html-lift → image node w/ width → html emit.
	roundTripSizedImgHasSrc:   output.includes('<img src="assets/wide.png"'),
	roundTripSizedImgHasWidth: /<img [^>]*width="640"[^>]*>/.test(output),
	roundTripSizedImgHasAlt:   /<img [^>]*alt="宽图"[^>]*>/.test(output),
	// Unsized images MUST NOT get rewritten to HTML — short syntax preserved.
	roundTripKeepsShortRelative: output.includes('![截图](assets/screenshot-1.png)'),
	roundTripKeepsShortRemote:   output.includes('![远程](https://example.com/pic.png)'),
	// parseImgTag: attribute extraction is order-independent, CJK-safe, entity-decoding.
	parseImgTagBasic: (() => {
		const a = parseImgTag('<img src="a.png" width="800" alt="hi">');
		return a && a.src === 'a.png' && a.width === 800 && a.alt === 'hi';
	})(),
	parseImgTagCjkAlt: (() => {
		const a = parseImgTag('<img alt="宽图" src="assets/wide.png" width="640">');
		return a && a.alt === '宽图' && a.width === 640;
	})(),
	parseImgTagSelfClose: (() => {
		const a = parseImgTag('<img src="x.png" width="120" />');
		return a && a.src === 'x.png' && a.width === 120;
	})(),
	parseImgTagRejectsNonImg: parseImgTag('<div>nope</div>') === null && parseImgTag('<img>') === null,
	// renderImgTag: escapes attribute values, only emits width when > 0.
	renderImgTagWithWidth:    renderImgTag({ src: 'a.png', alt: '', title: '', width: 300 }) === '<img src="a.png" width="300">',
	renderImgTagWithoutWidth: renderImgTag({ src: 'a.png', alt: '', title: '', width: 0 })   === '<img src="a.png">',
	renderImgTagEscapes:      renderImgTag({ src: 'a"b.png', alt: '<x>', title: '', width: 0 }) === '<img src="a&quot;b.png" alt="&lt;x&gt;">',
	// clampWidth: bounded [MIN, min(MAX, container)]; fractional rounded.
	clampBelowMinRaisesToMin: clampWidth(10, 1000) === IMAGE_RESIZE_MIN_PX,
	clampAboveContainerCaps:  clampWidth(9999, 800) === 800,
	clampFloatingRounded:     clampWidth(123.7, 1000) === 124,
	clampAbsoluteMax:         clampWidth(999999, 0) === IMAGE_RESIZE_MAX_PX,
	// widthFromDrag: e/se/ne/sw/w/nw all fold to signed dx; n/s inert.
	dragEastGrows:  widthFromDrag('e',  200, 100, 150, 1000) === 250,
	dragWestGrows:  widthFromDrag('w',  200, 100, 50,  1000) === 250,
	dragSEmatchesE: widthFromDrag('se', 200, 100, 150, 1000) === widthFromDrag('e', 200, 100, 150, 1000),
	dragNorthNoop:  widthFromDrag('n',  200, 100, 500, 1000) === 200,
	dragSouthNoop:  widthFromDrag('s',  200, 100, 500, 1000) === 200,
	// T-3.5.3 caption (alt-as-caption). Round-trip preserves alt for all image
	// carriers — shorthand, remote, sized HTML, empty, and specials-escaped.
	captionShorthandRoundTrip:   output.includes('![截图](assets/screenshot-1.png)'),
	captionRemoteRoundTrip:      output.includes('![远程](https://example.com/pic.png)'),
	captionSizedHtmlRoundTrip:   /<img[^>]*alt="宽图"[^>]*>/.test(output),
	captionEmptyStaysEmpty:      output.includes('![](assets/no-caption.png)'),
	captionEscapesBrackets:      /!\[图 1: 带 \\\[方括号\\\] 的图注\]\(assets\/fig1\.png\)/.test(output),
	// normalizeAlt: outer trim, keep interior spaces & CJK.
	normalizeAltTrims:           normalizeAlt('  hello  ') === 'hello',
	normalizeAltKeepsInterior:   normalizeAlt('图 1: 示意图') === '图 1: 示意图',
	normalizeAltFlattensNewline: normalizeAlt('a\nb') === 'a b',
	normalizeAltNullSafe:        normalizeAlt(null) === '' && normalizeAlt(undefined) === '',

	// T-3.5.4 alignment (Typora <p align="…">). Wrapped images round-trip as
	// html verbatim; bare `![]()` stays unwrapped (default = left).
	alignCenterRoundTrip:  /<p align="center"><img src="assets\/hero.png" alt="居中大图"><\/p>/.test(output),
	alignRightWithWidth:   /<p align="right"><img src="assets\/thumb.png" alt="右对齐" width="200"><\/p>/.test(output),
	alignBareStaysBare:    output.includes('![截图](assets/screenshot-1.png)'),
	alignBareRemoteStays:  output.includes('![远程](https://example.com/pic.png)'),
	// normalizeAlign: 'left'/''/garbage → null; case-insensitive.
	normalizeAlignLeftNull:   normalizeAlign('left') === null,
	normalizeAlignCenter:     normalizeAlign('CENTER') === 'center' && normalizeAlign(' Right ') === 'right',
	normalizeAlignNullSafe:   normalizeAlign(null) === null && normalizeAlign(undefined) === null && normalizeAlign('bogus') === null,
	// parseAlignWrapper: matches <p align> and <div align>, rejects non-wrappers.
	parseAlignPWrapper:       parseAlignWrapper('<p align="center"><img src="a.png"></p>')?.align === 'center',
	parseAlignDivWrapper:     parseAlignWrapper('<div align="right"><img src="b.png" width="120"></div>')?.align === 'right'
		&& parseAlignWrapper('<div align="right"><img src="b.png" width="120"></div>')?.width === 120,
	parseAlignRejectsPlain:   parseAlignWrapper('<img src="c.png">') === null,
	// renderAlignedImg: emits wrapper only for center/right.
	renderAlignedLeftBare:    renderAlignedImg({ src: 'a.png', align: 'left' })   === '<img src="a.png">',
	renderAlignedCenter:      renderAlignedImg({ src: 'a.png', align: 'center' }) === '<p align="center"><img src="a.png"></p>',
	renderAlignedRightWidth:  renderAlignedImg({ src: 'a.png', align: 'right', width: 300 }) === '<p align="right"><img src="a.png" width="300"></p>',
	// T-3.6 tables: GFM tables + column alignment round-trip. Milkdown normalises
	// the delimiter row to the minimum syntax (`:-` / `:-:` / `-:`) and pads header
	// cells with variable whitespace, so match on tokens not literal columns.
	tableHeaderPreserved:     output.includes('姓名') && output.includes('年龄') && output.includes('地区'),
	tableAlignSyntaxLeft:     /\|\s*:-+\s*\|/.test(output),
	tableAlignSyntaxCenter:   /\|\s*:-+:\s*\|/.test(output),
	tableAlignSyntaxRight:    /\|\s*-+:\s*\|/.test(output),
	tableBodyPreserved:       output.includes('张三') && output.includes('北京') && output.includes('李四'),
	tableNoChromeLeak:        !output.includes('vsword-table-wrap') && !output.includes('data-action'),

	// T-3.7 code block: fence + language + tab + custom-language passthrough.
	codeBlockFencePython:     /```python\n[\s\S]*?```/.test(output),
	codeBlockBodyPreserved:   output.includes('def greet(name):') && output.includes('return f"你好, {name}"'),
	codeBlockNoLangFence:     /```\nno language here/.test(output),
	codeBlockTabPreserved:    output.includes('	tab-indented line'),
	codeBlockCustomLangKept:  /```mermaid\n/.test(output),
	codeBlockNoChromeLeak:    !output.includes('vsword-code-wrap') && !output.includes('vsword-code-chrome'),
	// T-3.5c.5a code_block fence info meta 保真：
	//   - ```js {highlight-lines=[1,3]}``` 头行完整 round-trip
	//   - ```ts {title="demo.ts" line-numbers}``` 头行完整 round-trip（含引号 + 空格）
	//   - mermaid / python / no-lang 白名单：没有 meta 的头行不被 meta 分支误伤
	codeBlockMetaJsPreserved:      output.includes('```js {highlight-lines=[1,3]}\n'),
	codeBlockMetaTsPreserved:      output.includes('```ts {title="demo.ts" line-numbers}\n'),
	codeBlockMetaBodyPreserved:    output.includes('const a = 1;') && output.includes('const b = 2;') && output.includes('const c = 3;') && output.includes('export const x: number = 42;'),
	codeBlockMermaidWhitelistedNoMeta: /```mermaid\n(?!\{)/.test(output),
	codeBlockPythonHasNoMeta:      /```python\n(?!\{)/.test(output),
	codeBlockSchemaOverrideExported: !!codeBlockSchemaOverride && (Array.isArray(codeBlockSchemaOverride) ? codeBlockSchemaOverride.length >= 1 : typeof codeBlockSchemaOverride === 'object'),
	// T-3.5c.1 emoji shortcode：round-trip 保源码 · 未识别兜底 · helper 纯函数正确性。
	// 识别项 (`:smile:` / `:heart:`) 在 remark visitor 里被转成 emoji 节点，序列化写回 shortcode；
	// 未识别 (`:notarealemojiname:`) 保留原文本，不进 emoji 节点。
	emojiRoundTripKeepsSmile:        output.includes(':smile:'),
	emojiRoundTripKeepsHeart:        output.includes(':heart:'),
	emojiRoundTripKeepsUnknown:      output.includes(':notarealemojiname:'),
	// 输出里不能出现 unicode 表情字符（本轮策略：保源码，绝不写 unicode）。
	// 注：正则用 \uD83D\uDE00-\uDE4F 大致覆盖 emoticons + faces 段，够 fixture 用。
	emojiOutputHasNoUnicodeSmile:    !/\uD83D[\uDE00-\uDE7F]/.test(output),
	// helper: parseInlineEmoji 走 resolver 注入路径。
	parseEmojiSplitsRecognised: (() => {
		const out = parseInlineEmoji('a :smile: b', n => n === 'smile' ? '🙂' : null);
		return out.length === 3 && out[0].type === 'text' && out[1].type === 'emoji'
			&& out[1].name === 'smile' && out[2].type === 'text';
	})(),
	parseEmojiKeepsUnknownAsText: (() => {
		const out = parseInlineEmoji('a :notreal: b', () => null);
		return out.length === 1 && out[0].type === 'text' && out[0].value === 'a :notreal: b';
	})(),
	parseEmojiHandlesCjkAdjacency: (() => {
		const out = parseInlineEmoji('中文:smile:紧邻', n => n === 'smile' ? '🙂' : null);
		return out.length === 3 && out[0].value === '中文' && out[1].type === 'emoji' && out[2].value === '紧邻';
	})(),
	parseEmojiEscapedBackslashSkipped: (() => {
		const out = parseInlineEmoji('a \\:smile: b', n => n === 'smile' ? '🙂' : null);
		return out.length === 1 && out[0].type === 'text';
	})(),
	// resolver 契约：node-emoji.get 命中 → 非空 string；未命中 → null。
	resolverHitsSmile:               typeof resolveEmoji('smile') === 'string' && resolveEmoji('smile').length > 0,
	resolverMissesUnknown:           resolveEmoji('notarealemojiname') === null,
	resolverNullSafe:                resolveEmoji('') === null && resolveEmoji(null) === null,
	// stringifyEmoji: 始终写 `:name:`
	stringifyEmojiBasic:             stringifyEmoji('smile') === ':smile:',
	stringifyEmojiTrimsWhitespace:   stringifyEmoji('  smile  ') === ':smile:',
	stringifyEmojiEmptySafe:         stringifyEmoji('') === '' && stringifyEmoji(null) === '',
	// EMOJI_RE: 匹配单冒号形式，不匹配 footnote / 双冒号。
	emojiReMatchesShortcode:         'text :smile: end'.match(EMOJI_RE)?.[0] === ':smile:',
	emojiReIgnoresFootnote:          '[^1]'.match(EMOJI_RE) === null,
	emojiReIgnoresEmptyPair:         '::'.match(EMOJI_RE) === null,
	// extractShortcodeName: 严格匹配整段。
	extractNameFromColonForm:        extractShortcodeName(':smile:') === 'smile',
	extractNameRejectsGarbage:       extractShortcodeName('smile') === null && extractShortcodeName(':bad name:') === null,
	// T-3.5c.2 footnote：round-trip 保源码 · helpers 纯函数正确性 · HoverIntent 状态机。
	// 引用 + 定义都要 round-trip 无丢失（含 CJK 标签）。
	footnoteRefRoundTripDigit:       output.includes('[^1]'),
	footnoteRefRoundTripNamed:       output.includes('[^note]'),
	footnoteRefRoundTripCjk:         output.includes('[^中文标签]'),
	footnoteDefRoundTripDigit:       /\[\^1\]:\s+第一条脚注定义/.test(output),
	footnoteDefRoundTripNamed:       /\[\^note\]:\s+具名脚注/.test(output) && output.includes('**bold**') && output.includes('`code`'),
	footnoteDefRoundTripCjk:         /\[\^中文标签\]:\s+中文标签的定义正文/.test(output),
	// 输出里不能残留 preset-gfm 的 DOM 装饰痕迹（sup/dl 是 renderer 内部产物，不该跑到 markdown）。
	footnoteOutputHasNoSupTag:       !/<sup[^>]*data-type="footnote_reference"/.test(output),
	footnoteOutputHasNoDlTag:        !/<dl[^>]*data-type="footnote_definition"/.test(output),
	// helpers · normalizeLabel：大小写归一 + 空白折叠。
	normalizeLabelLowercases:        normalizeLabel('Foo') === 'foo',
	normalizeLabelCollapsesWs:       normalizeLabel('  Foo   Bar	') === 'foo bar',
	normalizeLabelNullSafe:          normalizeLabel(null) === '' && normalizeLabel(undefined) === '' && normalizeLabel(123) === '',
	normalizeLabelKeepsCjk:          normalizeLabel('中文 标签') === '中文 标签',
	// helpers · sanitizeLabelForSelector：CSS.escape 通路 + 兜底。
	sanitizeLabelReturnsString:      typeof sanitizeLabelForSelector('abc') === 'string',
	sanitizeLabelHandlesQuotes:     (() => {
		const s = sanitizeLabelForSelector('a"b');
		// CSS.escape 会转成 \" 或 \\22 ；兜底也是 \" 。两条路径都算通过。
		return s.includes('\\') || s === 'a"b'; // 至少不裸出未转义引号（jsdom CSS.escape 会转）
	})(),
	// helpers · mdastToPlainText：递归压平，跳空节点，块间插换行。
	mdastPlainTextInlineOnly:        mdastToPlainText({
		type: 'paragraph',
		children: [{ type: 'text', value: '你好' }, { type: 'inlineCode', value: 'code' }],
	}) === '你好code',
	mdastPlainTextBlocksJoin:        mdastToPlainText({
		type: 'root',
		children: [
			{ type: 'paragraph', children: [{ type: 'text', value: 'p1' }] },
			{ type: 'paragraph', children: [{ type: 'text', value: 'p2' }] },
		],
	}) === 'p1\np2',
	mdastPlainTextNullSafe:          mdastToPlainText(null) === '' && mdastToPlainText(undefined) === '',
	// helpers · truncateForPreview：短文本原样 · 长文本切在 whitespace + 加省略号。
	truncateShortPasses:             truncateForPreview('short', 240) === 'short',
	truncateLongCuts:                (() => {
		const long = 'a'.repeat(300);
		const out = truncateForPreview(long, 240);
		return out.endsWith('…') && out.length <= 241;
	})(),
	truncateNullSafe:                truncateForPreview(null) === '' && truncateForPreview(undefined) === '',
	// helpers · buildDefinitionIndex：首次 win + normalize key。
	buildDefIndexFirstWins:          (() => {
		const m = buildDefinitionIndex([
			{ label: 'Foo', textContent: 'first' },
			{ label: 'foo', textContent: 'second (should lose)' },
		]);
		const e = m.get('foo');
		return m.size === 1 && !!e && e.label === 'Foo' && e.preview === 'first';
	})(),
	buildDefIndexSkipsBadEntries:    (() => {
		const m = buildDefinitionIndex([null, { label: '', textContent: 'x' }, { textContent: 'y' }]);
		return m.size === 0;
	})(),
	// FootnoteHoverIntent 状态机：idle → pending → shown → closing → idle 闭环 · cancel-open 路径。
	hoverIntentInitialIdle:          new FootnoteHoverIntent().state === 'idle',
	hoverIntentEnterSchedulesOpen:   (() => {
		const it = new FootnoteHoverIntent(() => 1000);
		const r = it.enterAnchor({ label: 'x' });
		return r.action === 'schedule-open' && it.state === 'pending' && r.at === 1000 + FN_OPEN_DELAY_MS;
	})(),
	hoverIntentFireOpenTransitions: (() => {
		const it = new FootnoteHoverIntent(() => 0);
		it.enterAnchor({ label: 'x' });
		const r = it.fireOpen();
		return r.action === 'open' && r.target?.label === 'x' && it.state === 'shown';
	})(),
	hoverIntentLeaveWhilePendingCancels: (() => {
		const it = new FootnoteHoverIntent(() => 0);
		it.enterAnchor({ label: 'x' });
		const r = it.leaveAnchor();
		return r.action === 'cancel-open' && it.state === 'idle';
	})(),
	hoverIntentShownToClosing:       (() => {
		const it = new FootnoteHoverIntent(() => 500);
		it.enterAnchor({ label: 'x' });
		it.fireOpen();
		const r = it.leaveAnchor();
		return r.action === 'schedule-close' && it.state === 'closing' && r.at === 500 + FN_CLOSE_DELAY_MS;
	})(),
	hoverIntentReEnterCancelsClose:  (() => {
		const it = new FootnoteHoverIntent(() => 0);
		it.enterAnchor({ label: 'x' });
		it.fireOpen();
		it.leaveAnchor();
		const r = it.enterAnchor({ label: 'x' });
		return r.action === 'cancel-close' && it.state === 'shown';
	})(),
	hoverIntentCloseTimeoutBackToIdle: (() => {
		const it = new FootnoteHoverIntent(() => 0);
		it.enterAnchor({ label: 'x' });
		it.fireOpen();
		it.leaveAnchor();
		const r = it.fireClose();
		return r.action === 'close' && it.state === 'idle' && it.target === null;
	})(),
	// 延迟常量本身：与 wikilink-preview 同数量级但独立导出。
	hoverDelaysArePositiveIntegers:  Number.isInteger(FN_OPEN_DELAY_MS) && FN_OPEN_DELAY_MS > 0
		&& Number.isInteger(FN_CLOSE_DELAY_MS) && FN_CLOSE_DELAY_MS > 0,
	// T-3.5c.3 frontmatter round-trip：8 类 fixture 全部 byte-for-byte 恢复。
	frontmatterRoundTripAllFixtures: frontmatterRoundTripAllOk,
	frontmatterYamlBasicRoundTrip:   frontmatterFixtureResults.find(r => r.name === 'yaml-basic')?.ok === true,
	frontmatterYamlQuotedRoundTrip:  frontmatterFixtureResults.find(r => r.name === 'yaml-quoted')?.ok === true,
	frontmatterYamlIndentRoundTrip:  frontmatterFixtureResults.find(r => r.name === 'yaml-indent')?.ok === true,
	frontmatterYamlEmptyRoundTrip:   frontmatterFixtureResults.find(r => r.name === 'yaml-empty-val')?.ok === true,
	frontmatterYamlBadSyntaxRoundTrip: frontmatterFixtureResults.find(r => r.name === 'yaml-syntax-err')?.ok === true,
	frontmatterTomlRoundTrip:        frontmatterFixtureResults.find(r => r.name === 'toml-basic')?.ok === true,
	frontmatterJsonLegacyRoundTrip:  frontmatterFixtureResults.find(r => r.name === 'json-legacy')?.ok === true,
	frontmatterTrailingNewlineKept:  frontmatterFixtureResults.find(r => r.name === 'trailing-nl')?.ok === true,
	// helpers 纯函数正确性
	fmFlavorsAreFrozen:              Object.isFrozen(FLAVORS) && FLAVORS.includes('yaml') && FLAVORS.includes('toml') && FLAVORS.includes('json'),
	fmIsValidFlavorAccepts:          isValidFlavor('yaml') && isValidFlavor('toml') && isValidFlavor('json'),
	fmIsValidFlavorRejects:          !isValidFlavor('xml') && !isValidFlavor(null) && !isValidFlavor(42),
	fmExtractYamlTopLevelKeys:       (() => {
		const keys = extractTopLevelKeys('title: hi\ntags:\n  - a\nauthor: me\n', 'yaml');
		return keys.length === 3 && keys[0] === 'title' && keys[2] === 'author';
	})(),
	fmExtractTomlTopLevelKeys:       (() => {
		const keys = extractTopLevelKeys('title = "x"\ndate = 2026-01-01\n[section]\nignored = 1\n', 'toml');
		return keys.length === 2 && keys[0] === 'title' && keys[1] === 'date';
	})(),
	fmExtractJsonTopLevelKeys:       (() => {
		const keys = extractTopLevelKeys('{"a": 1, "b": {"nested": true}, "c": [1,2]}', 'json');
		return keys.length === 3 && keys[0] === 'a' && keys[2] === 'c';
	})(),
	fmSummarizeReturnsTitle:         (() => {
		const s = summarizeFrontmatter('title: Hello\ntags: [a]\n', 'yaml');
		return s.title === 'Hello' && s.fieldCount === 2 && s.flavor === 'yaml';
	})(),
	fmSummaryLabelWithTitle:         formatSummaryLabel({ flavor: 'yaml', title: 'Hi', keys: ['a', 'b'], fieldCount: 2 }) === '📄 Hi · 2 fields',
	fmSummaryLabelWithoutTitle:      formatSummaryLabel({ flavor: 'toml', title: null, keys: ['a'], fieldCount: 1 }) === '📄 TOML · 1 fields',
	fmSummaryLabelEmpty:             formatSummaryLabel({ flavor: 'yaml', title: null, keys: [], fieldCount: 0 }) === '📄 YAML（空）',
	fmFirstLineOfYamlError:          (() => {
		try { FRONTMATTER_PARSERS.yaml('title: [unclosed\n  key: val\n'); return false; }
		catch (err) {
			const e = firstLineOfError(err, 'yaml');
			return typeof e.message === 'string' && e.message.length > 0 && Number.isInteger(e.line) && e.line >= 1;
		}
	})(),
	fmDetectFrontmatterErrorNullOk:  detectFrontmatterError('title: ok\n', 'yaml', FRONTMATTER_PARSERS) === null,
	fmDetectFrontmatterErrorReturnsErr: (() => {
		const e = detectFrontmatterError('title: [unclosed\n', 'yaml', FRONTMATTER_PARSERS);
		return e && typeof e.message === 'string' && Number.isInteger(e.line);
	})(),
	fmStripFenceYaml:                stripFence('---\ntitle: x\n---', 'yaml') === 'title: x',
	fmStripFenceToml:                stripFence('+++\ntitle = "x"\n+++', 'toml') === 'title = "x"',
	fmAddFenceYaml:                  addFence('title: x', 'yaml') === '---\ntitle: x\n---',
	fmAddFenceRespectsTrailingNl:    addFence('title: x\n', 'yaml') === '---\ntitle: x\n---',
	// T-3.5b-flow.2 · Flowchart.js helpers 断言（纯函数 · 无需 flowchart.js runtime）。
	flowchartGetCodeBlockSource:     getCodeBlockSource({ textContent: 'st=>start: S\nst->e' }) === 'st=>start: S\nst->e',
	flowchartGetCodeBlockSourceNullSafe: getCodeBlockSource(null) === '' && getCodeBlockSource({}) === '',
	flowchartIsEmptyEmpty:           flowchartIsEmpty('') === true && flowchartIsEmpty('   \n	\n') === true && flowchartIsEmpty(null) === true,
	flowchartIsEmptyNonEmpty:        flowchartIsEmpty('st=>start: X') === false,
	flowchartAutoSizeClampsMin:      autoSizeTextareaPx('a') === 96,
	flowchartAutoSizeClampsMax:      autoSizeTextareaPx('a\n'.repeat(50)) === 480,
	flowchartAutoSizeCustomBounds:   autoSizeTextareaPx('a\n'.repeat(9), { lineHeightPx: 20, padPx: 20, minPx: 96, maxPx: 480 }) === 220,
	flowchartNormalizeStripsTrailingBlanks: normalizeFlowchartSource('a\nb\n\n\n') === 'a\nb',
	flowchartNormalizeKeepsInternal: normalizeFlowchartSource('a\n\nb\n') === 'a\n\nb',
	flowchartNormalizeNullSafe:      normalizeFlowchartSource(null) === '' && normalizeFlowchartSource(undefined) === '',
	flowchartExtractError:           extractFlowchartError(new Error('Wrong char in flowchart definition: !')) === 'Wrong char in flowchart definition: !',
	flowchartExtractErrorNullSafe:   extractFlowchartError(null) === null,
	flowchartHeadlineTrims:          formatErrorHeadline(new Error('x'.repeat(200)), 40).length <= 40 && formatErrorHeadline(new Error('x'.repeat(200)), 40).endsWith('…'),
	flowchartHeadlineShortAsIs:      formatErrorHeadline(new Error('short')) === 'short',
	flowchartParseErrorLineHit:      parseErrorLineNumber(new Error('Error on line 7: bad token')) === 7,
	flowchartParseErrorLineMiss:     parseErrorLineNumber(new Error('no line info')) === null,
	flowchartFormatStackHasMessage:  (() => {
		const s = formatErrorStack(new Error('boom'));
		return typeof s === 'string' && s.includes('boom');
	})(),
	flowchartFormatStackNullSafe:    formatErrorStack(null) === '' && formatErrorStack(undefined) === '',
	flowchartOffsetOfLineOne:        offsetOfLine('a\nb\nc', 1) === 0,
	flowchartOffsetOfLineThree:      offsetOfLine('a\nb\nc', 3) === 4,
	flowchartOffsetOfLineClamped:    offsetOfLine('a\nb', 99) === 3,
	flowchartOffsetOfLineNullSafe:   offsetOfLine('', 1) === 0 && offsetOfLine('', NaN) === 0,
	flowchartOptionsLightNoColors:   (() => {
		const o = buildFlowchartOptions(false);
		return typeof o === 'object' && !('font-color' in o) && !('fill' in o) && o['line-width'] === 2;
	})(),
	flowchartOptionsDarkHasContrast: (() => {
		const o = buildFlowchartOptions(true);
		return typeof o['font-color'] === 'string' && typeof o['fill'] === 'string' && o['font-color'] !== o['fill'];
	})(),
	// T-3.5b-seq.2 · js-sequence-diagrams helpers 断言（纯函数 · 无需 sequence-diagram runtime）。
	seqGetCodeBlockSource:           seqGetCodeBlockSource({ textContent: 'title: t\nA->B: hi' }) === 'title: t\nA->B: hi',
	seqGetCodeBlockSourceNullSafe:   seqGetCodeBlockSource(null) === '' && seqGetCodeBlockSource({}) === '',
	seqIsEmptyEmpty:                 sequenceIsEmpty('') === true && sequenceIsEmpty('  \n	\n') === true && sequenceIsEmpty(null) === true,
	seqIsEmptyNonEmpty:              sequenceIsEmpty('A->B: hi') === false,
	seqAutoSizeClampsMin:            seqAutoSizeTextareaPx('a') === 96,
	seqAutoSizeClampsMax:            seqAutoSizeTextareaPx('a\n'.repeat(50)) === 480,
	seqNormalizeStripsTrailingBlanks: normalizeSequenceSource('a\nb\n\n\n') === 'a\nb',
	seqNormalizeKeepsInternal:       normalizeSequenceSource('a\n\nb\n') === 'a\n\nb',
	seqNormalizeNullSafe:            normalizeSequenceSource(null) === '' && normalizeSequenceSource(undefined) === '',
	seqExtractParseError:            extractSequenceError(new Error("Parse error on line 3:\n  bad\nExpecting 'PARTICIPANT'")) === "Parse error on line 3:",
	seqExtractLexicalError:          extractSequenceError(new Error('Lexical error on line 5. Unrecognized text.')) === 'Lexical error on line 5. Unrecognized text.',
	seqExtractErrorNullSafe:         extractSequenceError(null) === null,
	seqHeadlineTrims:                seqFormatErrorHeadline(new Error('x'.repeat(200)), 40).length <= 40 && seqFormatErrorHeadline(new Error('x'.repeat(200)), 40).endsWith('…'),
	seqHeadlineFallback:             seqFormatErrorHeadline(null) === 'Sequence 渲染失败',
	seqParseErrorLineHit:            seqParseErrorLineNumber(new Error('Parse error on line 7: bad token')) === 7,
	seqLexicalErrorLineHit:          seqParseErrorLineNumber(new Error('Lexical error on line 12. Unrecognized text.')) === 12,
	seqParseErrorLineMiss:           seqParseErrorLineNumber(new Error('no line info')) === null,
	seqFormatStackHasMessage:        (() => {
		const s = seqFormatErrorStack(new Error('boom'));
		return typeof s === 'string' && s.includes('boom');
	})(),
	seqFormatStackNullSafe:          seqFormatErrorStack(null) === '' && seqFormatErrorStack(undefined) === '',
	seqOffsetOfLineOne:              seqOffsetOfLine('a\nb\nc', 1) === 0,
	seqOffsetOfLineThree:            seqOffsetOfLine('a\nb\nc', 3) === 4,
	seqOffsetOfLineClamped:          seqOffsetOfLine('a\nb', 99) === 3,
	seqOptionsSimpleTheme:           (() => {
		const o = buildSequenceOptions(false);
		return typeof o === 'object' && o.theme === 'simple';
	})(),
	seqOptionsDarkStillSimple:       (() => {
		// D-5：dark 主题暂仍走 simple（外层 CSS 覆盖颜色），不加载 WebFont。
		const o = buildSequenceOptions(true);
		return o.theme === 'simple';
	})(),
};
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
const result = { ok: failed.length === 0, failed, outputBytes: Buffer.byteLength(output), parserRoundTripBytes: Buffer.byteLength(parserRoundTrip), output };
console.log(JSON.stringify(result, null, 2));
if (failed.length) process.exit(1);
