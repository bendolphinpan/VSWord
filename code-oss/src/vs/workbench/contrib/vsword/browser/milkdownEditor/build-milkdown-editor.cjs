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
const blockHandlePath = path.join(srcDir, 'block-handle.mjs');
const blockHandleMenuPath = path.join(srcDir, 'block-handle-menu.mjs');
const blockHandleHelpersPath = path.join(srcDir, 'block-handle-helpers.mjs');
const mathViewPath = path.join(srcDir, 'math-view.mjs');
const mathViewHelpersPath = path.join(srcDir, 'math-view-helpers.mjs');
const mermaidViewPath = path.join(srcDir, 'mermaid-view.mjs');
const mermaidViewHelpersPath = path.join(srcDir, 'mermaid-view-helpers.mjs');
const wikilinkPath = path.join(srcDir, 'wikilink.mjs');
const wikilinkHelpersPath = path.join(srcDir, 'wikilink-helpers.mjs');
const wikilinkAutocompletePath = path.join(srcDir, 'wikilink-autocomplete.mjs');
const wikilinkPreviewPath = path.join(srcDir, 'wikilink-preview.mjs');
const wikilinkBacklinksPath = path.join(srcDir, 'wikilink-backlinks.mjs');
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
fs.writeFileSync(blockHandlePath, fs.readFileSync(path.join(webviewSrcDir, 'block-handle.template.js'), 'utf8'));
fs.writeFileSync(blockHandleMenuPath, fs.readFileSync(path.join(webviewSrcDir, 'block-handle-menu.template.js'), 'utf8'));
fs.writeFileSync(blockHandleHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'block-handle-helpers.template.js'), 'utf8'));
fs.writeFileSync(mathViewPath, fs.readFileSync(path.join(webviewSrcDir, 'math-view.template.js'), 'utf8'));
fs.writeFileSync(mathViewHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'math-view-helpers.template.js'), 'utf8'));
fs.writeFileSync(mermaidViewPath, fs.readFileSync(path.join(webviewSrcDir, 'mermaid-view.template.js'), 'utf8'));
fs.writeFileSync(mermaidViewHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'mermaid-view-helpers.template.js'), 'utf8'));
fs.writeFileSync(wikilinkPath, fs.readFileSync(path.join(webviewSrcDir, 'wikilink.template.js'), 'utf8'));
fs.writeFileSync(wikilinkHelpersPath, fs.readFileSync(path.join(webviewSrcDir, 'wikilink-helpers.template.js'), 'utf8'));
fs.writeFileSync(wikilinkAutocompletePath, fs.readFileSync(path.join(webviewSrcDir, 'wikilink-autocomplete.template.js'), 'utf8'));
fs.writeFileSync(wikilinkPreviewPath, fs.readFileSync(path.join(webviewSrcDir, 'wikilink-preview.template.js'), 'utf8'));
fs.writeFileSync(wikilinkBacklinksPath, fs.readFileSync(path.join(webviewSrcDir, 'wikilink-backlinks.template.js'), 'utf8'));
fs.writeFileSync(verifyPath, fs.readFileSync(path.join(webviewSrcDir, 'verify.template.mjs'), 'utf8'));

run(`npm install ${packages.join(' ')} --prefer-offline --no-audit --no-fund`);
const esbuild = require(path.join(builderDir, 'node_modules', 'esbuild'));
console.log('[milkdown-prod] esbuild webview bundle');
esbuild.buildSync({
	entryPoints: [entryPath],
	bundle: true,
	format: 'esm',
	target: 'es2022',
	outfile: bundlePath,
	legalComments: 'linked',
	minify: true,
	define: { 'process.env.NODE_ENV': '"production"' },
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
const result = {
	builtAt: new Date().toISOString(),
	milkdownVersion: '7.21.2',
	webviewBundleBytes: bundle.length,
	webviewBundleGzipBytes: zlib.gzipSync(bundle).length,
	roundTrip: verifyJson,
	cspNotes: {
		format: 'esm',
		minified: true,
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
