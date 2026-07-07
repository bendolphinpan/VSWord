#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 * VSWord Milkdown production bundle builder.
 *
 * Installs pinned Milkdown dependencies into <workspaceRoot>/.tmp/milkdown-prod-builder,
 * copies the source-controlled entry + round-trip verifier from ./webview/, and writes
 * CSP-safe webview assets into ./vendor/.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const zlib = require('zlib');

const codeOssRoot = process.cwd();
const workspaceRoot = path.resolve(codeOssRoot, '..');
const editorRoot = __dirname;
const builderDir = path.join(workspaceRoot, '.tmp', 'milkdown-prod-builder');
const srcDir = path.join(builderDir, 'src');
const vendorDir = path.join(editorRoot, 'vendor');
const webviewSrcDir = path.join(editorRoot, 'webview');
const entryPath = path.join(srcDir, 'webview-entry.mjs');
const slashMenuPath = path.join(srcDir, 'slash-menu.mjs');
const highlightPath = path.join(srcDir, 'highlight.mjs');
const underlinePath = path.join(srcDir, 'underline.mjs');
const shortcutsPath = path.join(srcDir, 'shortcuts.mjs');
const inputRulesPath = path.join(srcDir, 'input-rules.mjs');
const focusModePath = path.join(srcDir, 'focus-mode.mjs');
const modeControllerPath = path.join(srcDir, 'mode-controller.mjs');
const viewModeEditablePath = path.join(srcDir, 'view-mode-editable.mjs');
// T-3.7b.d: ModeSwitchComponent + IMilkdownUIComponent contract。
const uiComponentPath = path.join(srcDir, 'ui-component.mjs');
const modeSwitchPath = path.join(srcDir, 'mode-switch.mjs');
const themesPath = path.join(srcDir, 'themes.mjs');
const outlineExtractorPath = path.join(srcDir, 'outline-extractor.mjs');
const imageUploadPath = path.join(srcDir, 'image-upload.mjs');
const imageResizePath = path.join(srcDir, 'image-resize.mjs');
const imageSchemaOverridePath = path.join(srcDir, 'image-schema-override.mjs');
const imageNodeViewPath = path.join(srcDir, 'image-node-view.mjs');
const tableChromePath = path.join(srcDir, 'table-chrome.mjs');
const tableChromeHelpersPath = path.join(srcDir, 'table-chrome-helpers.mjs');
const codeBlockChromePath = path.join(srcDir, 'code-block-chrome.mjs');
const codeBlockHelpersPath = path.join(srcDir, 'code-block-helpers.mjs');
// T-3.5c.5a: code_block schema 覆盖，fence info meta 保真。
const codeBlockSchemaOverridePath = path.join(srcDir, 'code-block-schema-override.mjs');
const blockHandlePath = path.join(srcDir, 'block-handle.mjs');
const blockHandleMenuPath = path.join(srcDir, 'block-handle-menu.mjs');
const blockHandleHelpersPath = path.join(srcDir, 'block-handle-helpers.mjs');
const mathViewPath = path.join(srcDir, 'math-view.mjs');
const mathViewHelpersPath = path.join(srcDir, 'math-view-helpers.mjs');
const mermaidViewPath = path.join(srcDir, 'mermaid-view.mjs');
const mermaidViewHelpersPath = path.join(srcDir, 'mermaid-view-helpers.mjs');
// T-3.5b-flow.2: flowchart.js NodeView + raphael 共享依赖（内联进主 bundle,
// chunk 拆分延后到 T-3.5b-flowseq.3）。
const flowchartViewPath = path.join(srcDir, 'flowchart-view.mjs');
const flowchartViewHelpersPath = path.join(srcDir, 'flowchart-view-helpers.mjs');
// T-3.5b-seq.2: js-sequence-diagrams NodeView + underscore + raphael 共享。
// raphael 与 flowchart.js 复用同一份 2.3.0 版本（内联进主 bundle）。
const sequenceViewPath = path.join(srcDir, 'sequence-view.mjs');
const sequenceViewHelpersPath = path.join(srcDir, 'sequence-view-helpers.mjs');
const wikilinkPath = path.join(srcDir, 'wikilink.mjs');
const wikilinkHelpersPath = path.join(srcDir, 'wikilink-helpers.mjs');
const wikilinkAutocompletePath = path.join(srcDir, 'wikilink-autocomplete.mjs');
const wikilinkPreviewPath = path.join(srcDir, 'wikilink-preview.mjs');
const wikilinkBacklinksPath = path.join(srcDir, 'wikilink-backlinks.mjs');
const subSupPath = path.join(srcDir, 'sub-sup.mjs');
const subSupHelpersPath = path.join(srcDir, 'sub-sup-helpers.mjs');
// T-3.5c.1: emoji shortcode 保源码。
const emojiPath = path.join(srcDir, 'emoji.mjs');
const emojiHelpersPath = path.join(srcDir, 'emoji-helpers.mjs');
// T-3.5c.2: footnote 引用+定义+hover+跳转。
const footnotePath = path.join(srcDir, 'footnote.mjs');
const footnoteHelpersPath = path.join(srcDir, 'footnote-helpers.mjs');
const footnotePreviewPath = path.join(srcDir, 'footnote-preview.mjs');
// T-3.5c.5b: setext heading 保真。
const setextHelpersPath = path.join(srcDir, 'setext-helpers.mjs');
const setextHeadingPath = path.join(srcDir, 'setext-heading.mjs');
// T-3.5c.3: frontmatter YAML/TOML 折叠 NodeView 保源码。
const frontmatterPath = path.join(srcDir, 'frontmatter.mjs');
const frontmatterHelpersPath = path.join(srcDir, 'frontmatter-helpers.mjs');
// T-3.7c.1.a: [TOC] 占位符 remark + PM schema。
const tocRemarkPath = path.join(srcDir, 'toc-remark.mjs');
const tocNodePath = path.join(srcDir, 'toc-node.mjs');
// T-3.7c.1.b: TOC NodeView + 事务级集中重算 Plugin。
const tocViewPath = path.join(srcDir, 'toc-view.mjs');
const verifyPath = path.join(srcDir, 'roundtrip-verify.mjs');
const bundlePath = path.join(vendorDir, 'index.js');
const resultPath = path.join(vendorDir, 'build-result.json');
const thirdPartyPath = path.join(vendorDir, 'THIRD_PARTY_LICENSES.md');

const packages = [
	'@milkdown/core@7.21.2',
	'@milkdown/preset-commonmark@7.21.2',
	'@milkdown/preset-gfm@7.21.2',
	'@milkdown/plugin-history@7.21.2',
	'@milkdown/plugin-listener@7.21.2',
	'@milkdown/plugin-prism@7.21.2',
	// NOTE: @milkdown/plugin-math is deprecated by upstream (last release 7.5.9). It still
	// works against @milkdown/core 7.21.2 (peer accepts ^7.2.0) — npm nests the older
	// @milkdown/utils/@milkdown/exception inside plugin-math to satisfy its own deps. Two
	// copies of those internal packages exist in the graph but only plugin-math sees the
	// older ones; the MilkdownPlugin shape is stable across minor versions.
	'@milkdown/plugin-math@7.5.9',
	'katex@0.16.11',
	'@milkdown/plugin-slash@7.21.2',
	'@milkdown/plugin-upload@7.21.2',
	'@milkdown/plugin-block@7.21.2',
	'unist-util-visit@5.1.0',
	'@milkdown/transformer@7.21.2',
	'@milkdown/prose@7.21.2',
	// T-3.5b.2: mermaid runtime. spike 已验证 22/22 全绿。当前 esbuild bundle 未开
	// splitting，`import('mermaid')` 会被内联进主 bundle（≈2-3MB），T-3.5b.2.b 遗留
	// 做代码分割 + 独立 chunk 懒加载。
	'mermaid@11.14.0',
	// T-3.5b-flow.2: Flowchart.js + raphael (spike T-3.5b-flow.1 GO 无条件放行)。
	// raphael 2.3.0 与 flowchart.js@1.18.0 声明的 dep 一致；后续 seq.2 落地后
	// 通过 npm overrides 强制统一版本，此处直接对齐。
	'flowchart.js@1.18.0',
	'raphael@2.3.0',
	// T-3.5b-seq.2: js-sequence-diagrams (rokt33r fork) 加 underscore。
	// raphael 与 flowchart.js 声明的 dep 一致；`sequence-diagram-raphael-min.js`
	// 顶层读全局 `Raphael` / `_`，sequence-view.mjs 的 loader 会把它们挂到 globalThis 上。
	'@rokt33r/js-sequence-diagrams@2.0.6-2',
	'underscore@1.13.7',
	// T-3.5c.1: emoji shortcode → unicode 查表（自研 remark plugin 消费）。
	'node-emoji@2.2.0',
	// T-3.5c.3: frontmatter YAML/TOML 折叠 NodeView 保源码。
	'remark-frontmatter@5.0.0',
	'js-yaml@4.1.0',
	'@iarna/toml@2.2.5',
	'esbuild@0.27.0',
	'jsdom@27.3.0',
];

function run(command, cwd = builderDir) {
	console.log(`[milkdown-prod] ${command}`);
	cp.execFileSync(process.platform === 'win32' ? 'cmd.exe' : 'sh', process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command], {
		cwd,
		stdio: 'inherit',
	});
}

function exec(command, cwd = builderDir) {
	return cp.execFileSync(process.platform === 'win32' ? 'cmd.exe' : 'sh', process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command], {
		cwd,
		encoding: 'utf8',
	});
}

fs.mkdirSync(srcDir, { recursive: true });
fs.mkdirSync(vendorDir, { recursive: true });
if (!fs.existsSync(path.join(builderDir, 'package.json'))) {
	fs.writeFileSync(path.join(builderDir, 'package.json'), JSON.stringify({
		private: true,
		name: 'vsword-milkdown-prod-builder',
		version: '0.0.0',
		type: 'module',
	}, null, 2));
}

// T-3.3 refactor: entry and verifier live under ./webview/ as real source files, no more
// giant embedded string literals. Copy them verbatim into the builder so esbuild / node can
// resolve @milkdown/* imports out of the .tmp/node_modules tree.
fs.writeFileSync(entryPath, fs.readFileSync(path.join(webviewSrcDir, 'entry.template.js'), 'utf8'));
fs.writeFileSync(slashMenuPath, fs.readFileSync(path.join(webviewSrcDir, 'slash-menu.template.js'), 'utf8'));
fs.writeFileSync(highlightPath, fs.readFileSync(path.join(webviewSrcDir, 'highlight.template.js'), 'utf8'));
fs.writeFileSync(underlinePath, fs.readFileSync(path.join(webviewSrcDir, 'underline.template.js'), 'utf8'));
fs.writeFileSync(shortcutsPath, fs.readFileSync(path.join(webviewSrcDir, 'shortcuts.template.js'), 'utf8'));
fs.writeFileSync(inputRulesPath, fs.readFileSync(path.join(webviewSrcDir, 'input-rules.template.js'), 'utf8'));
fs.writeFileSync(focusModePath, fs.readFileSync(path.join(webviewSrcDir, 'focus-mode.template.js'), 'utf8'));
fs.writeFileSync(modeControllerPath, fs.readFileSync(path.join(webviewSrcDir, 'mode-controller.template.js'), 'utf8'));
fs.writeFileSync(viewModeEditablePath, fs.readFileSync(path.join(webviewSrcDir, 'view-mode-editable.template.js'), 'utf8'));
// T-3.7b.d
fs.writeFileSync(uiComponentPath, fs.readFileSync(path.join(webviewSrcDir, 'ui-component.template.js'), 'utf8'));
fs.writeFileSync(modeSwitchPath, fs.readFileSync(path.join(webviewSrcDir, 'mode-switch.template.js'), 'utf8'));
fs.writeFileSync(themesPath, fs.readFileSync(path.join(webviewSrcDir, 'themes.template.js'), 'utf8'));
fs.writeFileSync(outlineExtractorPath, fs.readFileSync(path.join(webviewSrcDir, 'outline-extractor.template.js'), 'utf8'));
fs.writeFileSync(imageUploadPath, fs.readFileSync(path.join(webviewSrcDir, 'image-upload.template.js'), 'utf8'));
fs.writeFileSync(imageResizePath, fs.readFileSync(path.join(webviewSrcDir, 'image-resize.template.js'), 'utf8'));
fs.writeFileSync(imageSchemaOverridePath, fs.readFileSync(path.join(webviewSrcDir, 'image-schema-override.template.js'), 'utf8'));
fs.writeFileSync(imageNodeViewPath, fs.readFileSync(path.join(webviewSrcDir, 'image-node-view.template.js'), 'utf8'));
fs.writeFileSync(tableChromePath, fs.readFileSync(path.join(webviewSrcDir, 'table-chrome.template.js'), 'utf8'));
fs.writeFileSync(tableChromeHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'table-chrome-helpers.template.js'), 'utf8'));
fs.writeFileSync(codeBlockChromePath, fs.readFileSync(path.join(webviewSrcDir, 'code-block-chrome.template.js'), 'utf8'));
fs.writeFileSync(codeBlockHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'code-block-helpers.template.js'), 'utf8'));
fs.writeFileSync(codeBlockSchemaOverridePath, fs.readFileSync(path.join(webviewSrcDir, 'code-block-schema-override.template.js'), 'utf8'));
fs.writeFileSync(blockHandlePath, fs.readFileSync(path.join(webviewSrcDir, 'block-handle.template.js'), 'utf8'));
fs.writeFileSync(blockHandleMenuPath, fs.readFileSync(path.join(webviewSrcDir, 'block-handle-menu.template.js'), 'utf8'));
fs.writeFileSync(blockHandleHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'block-handle-helpers.template.js'), 'utf8'));
fs.writeFileSync(mathViewPath, fs.readFileSync(path.join(webviewSrcDir, 'math-view.template.js'), 'utf8'));
fs.writeFileSync(mathViewHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'math-view-helpers.template.js'), 'utf8'));
fs.writeFileSync(mermaidViewPath, fs.readFileSync(path.join(webviewSrcDir, 'mermaid-view.template.js'), 'utf8'));
fs.writeFileSync(mermaidViewHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'mermaid-view-helpers.template.js'), 'utf8'));
// T-3.5b-flow.2: flowchart-view NodeView + helpers。
fs.writeFileSync(flowchartViewPath, fs.readFileSync(path.join(webviewSrcDir, 'flowchart-view.template.js'), 'utf8'));
fs.writeFileSync(flowchartViewHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'flowchart-view-helpers.template.js'), 'utf8'));
// T-3.5b-seq.2: sequence-view NodeView + helpers。
fs.writeFileSync(sequenceViewPath, fs.readFileSync(path.join(webviewSrcDir, 'sequence-view.template.js'), 'utf8'));
fs.writeFileSync(sequenceViewHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'sequence-view-helpers.template.js'), 'utf8'));
fs.writeFileSync(wikilinkPath, fs.readFileSync(path.join(webviewSrcDir, 'wikilink.template.js'), 'utf8'));
fs.writeFileSync(wikilinkHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'wikilink-helpers.template.js'), 'utf8'));
fs.writeFileSync(wikilinkAutocompletePath, fs.readFileSync(path.join(webviewSrcDir, 'wikilink-autocomplete.template.js'), 'utf8'));
fs.writeFileSync(wikilinkPreviewPath, fs.readFileSync(path.join(webviewSrcDir, 'wikilink-preview.template.js'), 'utf8'));
fs.writeFileSync(wikilinkBacklinksPath, fs.readFileSync(path.join(webviewSrcDir, 'wikilink-backlinks.template.js'), 'utf8'));
fs.writeFileSync(subSupPath, fs.readFileSync(path.join(webviewSrcDir, 'sub-sup.template.js'), 'utf8'));
fs.writeFileSync(subSupHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'sub-sup-helpers.template.js'), 'utf8'));
// T-3.5c.1: emoji shortcode 保源码。
fs.writeFileSync(emojiPath, fs.readFileSync(path.join(webviewSrcDir, 'emoji.template.js'), 'utf8'));
fs.writeFileSync(emojiHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'emoji-helpers.template.js'), 'utf8'));
// T-3.5c.2: footnote 引用+定义+hover+跳转。
fs.writeFileSync(footnotePath, fs.readFileSync(path.join(webviewSrcDir, 'footnote.template.js'), 'utf8'));
fs.writeFileSync(footnoteHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'footnote-helpers.template.js'), 'utf8'));
fs.writeFileSync(footnotePreviewPath, fs.readFileSync(path.join(webviewSrcDir, 'footnote-preview.template.js'), 'utf8'));
// T-3.5c.5b: setext heading 保真。
fs.writeFileSync(setextHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'setext-helpers.template.js'), 'utf8'));
fs.writeFileSync(setextHeadingPath, fs.readFileSync(path.join(webviewSrcDir, 'setext-heading.template.js'), 'utf8'));
// T-3.5c.3: frontmatter YAML/TOML 折叠 NodeView 保源码。
fs.writeFileSync(frontmatterPath, fs.readFileSync(path.join(webviewSrcDir, 'frontmatter.template.js'), 'utf8'));
fs.writeFileSync(frontmatterHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'frontmatter-helpers.template.js'), 'utf8'));
// T-3.7c.1.a: [TOC] 占位符 remark + PM schema。
fs.writeFileSync(tocRemarkPath, fs.readFileSync(path.join(webviewSrcDir, 'toc-remark.template.js'), 'utf8'));
fs.writeFileSync(tocNodePath, fs.readFileSync(path.join(webviewSrcDir, 'toc-node.template.js'), 'utf8'));
fs.writeFileSync(tocViewPath, fs.readFileSync(path.join(webviewSrcDir, 'toc-view.template.js'), 'utf8'));
fs.writeFileSync(verifyPath, fs.readFileSync(path.join(webviewSrcDir, 'verify.template.mjs'), 'utf8'));

run(`npm install ${packages.join(' ')} --prefer-offline --no-audit --no-fund`);
const esbuild = require(path.join(builderDir, 'node_modules', 'esbuild'));

// T-3.5b-flowseq.3b: 首屏 stub 剥离 mermaid / flowchart+raphael / js-sequence-diagrams。
//   entry.template.js 里三个可视化 NodeView 用 `await import('mermaid')` /
//   `await import('flowchart.js')` / `await import('@rokt33r/js-sequence-diagrams/...')`
//   动态引入，esbuild `splitting:true` 会把每条 dynamic import 拆到独立 chunk；
//   共享依赖 raphael 会被自动抽成第 4 个共享 chunk 只加载一次。
//
//   输出结构（vendor/）：
//     index.js         —— 首屏 stub（Milkdown + PM + KaTeX + 全部 NodeView 骨架）
//     chunk-XXXX.js    —— 三个可视化库 + raphael 共享 chunk（懒加载）
//     THIRD_PARTY_LICENSES.md · build-result.json · katex/**  —— 其他保持不变
//
//   构建前必须清一次 vendor/*.js，否则上一轮的 chunk 残留会污染结果。
console.log('[milkdown-prod] cleaning stale bundle chunks from vendor/');
for (const name of fs.readdirSync(vendorDir)) {
	// 只清 .js 与 .js.LEGAL.txt，保留 build-result.json / THIRD_PARTY_LICENSES.md / katex/。
	if (name.endsWith('.js') || name.endsWith('.js.map') || name.endsWith('.js.LEGAL.txt')) {
		fs.rmSync(path.join(vendorDir, name), { force: true });
	}
}

console.log('[milkdown-prod] esbuild webview bundle (splitting on · mermaid / flowchart+raphael / sequence lazy)');
const esbuildResult = esbuild.buildSync({
	entryPoints: { index: entryPath },
	bundle: true,
	format: 'esm',
	target: 'es2022',
	outdir: vendorDir,
	splitting: true,
	entryNames: '[name]',
	chunkNames: 'chunk-[hash]',
	legalComments: 'linked',
	minify: true,
	metafile: true,
	define: { 'process.env.NODE_ENV': '"production"' },
	// T-3.5b-seq.2: rokt33r/js-sequence-diagrams UMD wrapper 里含 `require("fs")` /
	// `require("path")`（webfontloader 的 CJS 兼容分支 dead-code）；webview 不走这条
	// 路径，用 alias 指向空存根让 esbuild resolve 过。
	alias: {
		fs: path.join(builderDir, 'src', 'empty-shim.js'),
		path: path.join(builderDir, 'src', 'empty-shim.js'),
	},
});

// T-3.3.4: copy KaTeX stylesheet + fonts into vendor/katex/ so the webview can load them
// via localResourceRoots without touching the network. Font files are referenced by relative
// URLs from katex.min.css (fonts/KaTeX_*.woff2 etc.), so we mirror the whole layout.
const katexSrc = path.join(builderDir, 'node_modules', 'katex', 'dist');
const katexVendorDir = path.join(vendorDir, 'katex');
fs.rmSync(katexVendorDir, { recursive: true, force: true });
fs.mkdirSync(katexVendorDir, { recursive: true });
fs.copyFileSync(path.join(katexSrc, 'katex.min.css'), path.join(katexVendorDir, 'katex.min.css'));
fs.cpSync(path.join(katexSrc, 'fonts'), path.join(katexVendorDir, 'fonts'), { recursive: true });
const katexFontCount = fs.readdirSync(path.join(katexVendorDir, 'fonts')).length;
console.log(`[milkdown-prod] copied KaTeX CSS + ${katexFontCount} font files into vendor/katex/`);

console.log('[milkdown-prod] run roundtrip verifier');
const verifyJson = JSON.parse(cp.execFileSync(process.execPath, [verifyPath], { cwd: builderDir, encoding: 'utf8' }));
const bundleText = fs.readFileSync(bundlePath, 'utf8');
const bundle = Buffer.from(bundleText);

// T-3.5b-flowseq.3b: 收集所有 chunk 尺寸 + 分类（stub / mermaid / flow+raphael / sequence / shared）。
//   分类靠 esbuild metafile 里 chunk 的 inputs 特征库：
//     - 含 mermaid/dist/*     → mermaid chunk
//     - 含 flowchart.js/*     → flowchart chunk
//     - 含 raphael/*          → raphael chunk（若被 flow+sequence 共享则单独抽出）
//     - 含 js-sequence-diagrams/* → sequence chunk
//     - 其他 dynamic-import 产物 → misc chunk
//   首屏 stub 增量 = index.js gzip（相对 flowseq.3 之前基线 1.27MB gzip / 4.62MB 明文）。
const meta = esbuildResult.metafile;
function classifyChunk(inputsObj) {
	const keys = Object.keys(inputsObj);
	const contains = (needle) => keys.some((k) => k.replace(/\\/g, '/').includes(needle));
	if (contains('/mermaid/')) return 'mermaid';
	if (contains('/flowchart.js/') || contains('/flowchart/release/')) return 'flowchart';
	if (contains('/js-sequence-diagrams/') || contains('@rokt33r/js-sequence-diagrams')) return 'sequence';
	if (contains('/raphael/')) return 'raphael';
	return 'misc';
}
const chunkBreakdown = [];
for (const [outFile, info] of Object.entries(meta.outputs)) {
	if (!outFile.endsWith('.js') || outFile.endsWith('.LEGAL.txt')) continue;
	const rel = path.relative(vendorDir, path.resolve(codeOssRoot, outFile)).replace(/\\/g, '/');
	const buf = fs.readFileSync(path.join(vendorDir, rel));
	const category = rel === 'index.js' ? 'stub' : classifyChunk(info.inputs || {});
	chunkBreakdown.push({
		file: rel,
		bytes: buf.length,
		gzipBytes: zlib.gzipSync(buf).length,
		category,
	});
}
chunkBreakdown.sort((a, b) => b.bytes - a.bytes);
const stubEntry = chunkBreakdown.find((c) => c.file === 'index.js');

const result = {
	builtAt: new Date().toISOString(),
	milkdownVersion: '7.21.2',
	webviewBundleBytes: bundle.length,
	webviewBundleGzipBytes: zlib.gzipSync(bundle).length,
	// T-3.5b-flowseq.3b: 首屏 stub（index.js）明文 + gzip 尺寸，便于 gate-g 断言 ≤20KB gzip。
	stubBundleBytes: stubEntry ? stubEntry.bytes : bundle.length,
	stubBundleGzipBytes: stubEntry ? stubEntry.gzipBytes : zlib.gzipSync(bundle).length,
	chunkBreakdown,
	roundTrip: verifyJson,
	cspNotes: {
		format: 'esm',
		minified: true,
		splitting: true,
		dynamicEvalScan: {
			evalToken: /\beval\s*\(/.test(bundleText),
			newFunctionToken: /new Function\s*\(/.test(bundleText),
		},
	},
};
fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
const licenseJson = exec('npm ls --json --long --all');
const tree = JSON.parse(licenseJson);
const lines = ['# VSWord Milkdown production third-party licenses', '', `Generated: ${new Date().toISOString()}`, '', '| Package | Version | License | Resolved |', '| --- | --- | --- | --- |'];
const seen = new Set();
function walk(node) {
	const deps = node.dependencies || {};
	for (const [depName, dep] of Object.entries(deps)) {
		const key = `${depName}@${dep.version || 'unknown'}`;
		if (!seen.has(key)) {
			seen.add(key);
			lines.push(`| ${depName} | ${dep.version || ''} | ${String(dep.license || dep.licenses || '').replace(/\|/g, '\\|')} | ${dep.resolved || ''} |`);
		}
		walk(dep);
	}
}
walk(tree);
fs.writeFileSync(thirdPartyPath, lines.join('\n') + '\n');
console.log(JSON.stringify(result, null, 2));
