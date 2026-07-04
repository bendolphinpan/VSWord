#!/usr/bin/env node
// scan-csp.mjs
// T-3.5b.1 · 静态扫 mermaid dist 里可能触发 webview CSP 的动态代码构造点。
// 报告：Function( / new Function( / eval( / import(...) / new Worker / wasm。
// CSP 现状：`script-src ${cspSource};` — 无 'unsafe-eval'、无 'wasm-unsafe-eval'。
// 一旦 dist 里出现 Function/eval，webview 会当场 CSP 拒绝，图渲染失败。

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, 'node_modules/mermaid/dist');

// 只扫 .mjs 源码，不扫 .mjs.map / .d.ts。
function walk(dir, acc = []) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		const st = statSync(p);
		if (st.isDirectory()) walk(p, acc);
		else if (name.endsWith('.mjs')) acc.push(p);
	}
	return acc;
}

const patterns = [
	{ id: 'new Function',   re: /\bnew\s+Function\s*\(/g },
	{ id: 'Function(...)',  re: /(?<![A-Za-z0-9_$.])Function\s*\(\s*["'`]/g }, // Function("code")
	{ id: 'eval(',          re: /(?<![A-Za-z0-9_$.])eval\s*\(/g },
	{ id: 'import(',        re: /(?<![A-Za-z0-9_$.])import\s*\(/g }, // dynamic import
	{ id: 'new Worker',     re: /\bnew\s+Worker\s*\(/g },
	{ id: 'importScripts',  re: /\bimportScripts\s*\(/g },
	{ id: 'WebAssembly.',   re: /\bWebAssembly\./g },
	{ id: '.wasm',          re: /\.wasm['"`)]/g },
];

const files = walk(ROOT);
const hits = new Map(); // pattern.id -> [{file, line, snippet}]

for (const file of files) {
	const src = readFileSync(file, 'utf8');
	for (const { id, re } of patterns) {
		re.lastIndex = 0;
		let m;
		while ((m = re.exec(src)) !== null) {
			// 找出这一处所在的行号 + 前后 40 字符片段
			const upto = src.slice(0, m.index);
			const line = upto.split('\n').length;
			const from = Math.max(0, m.index - 30);
			const to = Math.min(src.length, m.index + 60);
			const snippet = src.slice(from, to).replace(/\s+/g, ' ');
			if (!hits.has(id)) hits.set(id, []);
			hits.get(id).push({
				file: file.replace(ROOT + '\\', '').replace(ROOT + '/', ''),
				line,
				snippet,
			});
		}
	}
}

const report = {
	scannedFiles: files.length,
	rootDir: ROOT,
	patterns: {},
};
for (const { id } of patterns) {
	const list = hits.get(id) || [];
	report.patterns[id] = {
		count: list.length,
		firstThree: list.slice(0, 3),
	};
}

// 把动态 import 分成两类：相对路径（chunk 拆分点，OK）vs 变量表达式（可能被 CSP 卡）
const dynImports = hits.get('import(') || [];
const varImports = [];
for (const h of dynImports) {
	// 通过在原文里再匹配一次上下文来看 import( 后面的第一个字符
	const src = readFileSync(join(ROOT, h.file), 'utf8');
	const lines = src.split('\n');
	const line = lines[h.line - 1] || '';
	// 提取 import( 后到第一个 ) 之间的表达式
	const idx = line.indexOf('import(');
	if (idx === -1) continue;
	const rest = line.slice(idx + 7);
	const arg = rest.match(/^\s*([^)]+?)\s*[),]/)?.[1] || rest.slice(0, 40);
	if (!/^["'`]/.test(arg.trim())) {
		// 非字符串字面量参数
		varImports.push({ file: h.file, line: h.line, arg });
	}
}
report.dynamicImportSummary = {
	total: dynImports.length,
	nonLiteral: varImports.length,
	nonLiteralSamples: varImports.slice(0, 5),
};

console.log(JSON.stringify(report, null, 2));
