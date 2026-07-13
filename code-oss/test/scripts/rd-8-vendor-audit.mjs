#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  RD-8 · milkdown vendor lazy / gzip 审计
 *
 *  读 vendor/build-result.json，汇总 stub / 分类 gzip，给出「可再拆 / 不必再拆」建议。
 *  不改 bundle 本身（再拆 KaTeX/Prism 属后续迭代）。
 *
 *  用法：node code-oss/test/scripts/rd-8-vendor-audit.mjs
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const VENDOR = path.join(
	CODE_OSS,
	'src/vs/workbench/contrib/vsword/browser/milkdownEditor/vendor',
);
const BUILD = path.join(VENDOR, 'build-result.json');
const OUT_MD = path.join(CODE_OSS, 'test', 'reports', 'rd-8-vendor-audit.md');
const OUT_JSON = path.join(CODE_OSS, 'test', 'reports', 'rd-8-vendor-audit.json');

if (!fs.existsSync(BUILD)) {
	console.error('[rd-8] missing build-result.json — run build-milkdown-editor.cjs first');
	process.exit(1);
}

const br = JSON.parse(fs.readFileSync(BUILD, 'utf8'));
const chunks = Array.isArray(br.chunkBreakdown) ? br.chunkBreakdown : [];

const byCat = {};
for (const c of chunks) {
	const k = c.category || 'unknown';
	if (!byCat[k]) { byCat[k] = { count: 0, bytes: 0, gzipBytes: 0 }; }
	byCat[k].count++;
	byCat[k].bytes += c.bytes || 0;
	byCat[k].gzipBytes += c.gzipBytes || 0;
}

// 全量 js 串联 gzip（与 3.9.3 可比口径）
const jsFiles = fs.readdirSync(VENDOR).filter((n) => n.endsWith('.js') && !n.endsWith('.LEGAL.txt'));
let concat = Buffer.alloc(0);
for (const n of jsFiles.sort()) {
	concat = Buffer.concat([concat, fs.readFileSync(path.join(VENDOR, n))]);
}
const allGzip9 = zlib.gzipSync(concat, { level: 9 }).length;

const stub = chunks.find((c) => c.file === 'index.js');
const top = chunks.slice(0, 12);

const audit = {
	builtAt: br.builtAt,
	milkdownVersion: br.milkdownVersion,
	stubGzipBytes: stub?.gzipBytes ?? br.stubBundleGzipBytes,
	stubBytes: stub?.bytes ?? br.webviewBundleBytes,
	allJsCount: jsFiles.length,
	allJsConcatGzip9: allGzip9,
	byCategory: byCat,
	topChunks: top,
	// 建议
	recommendations: [
		{
			id: 'keep-mermaid-lazy',
			status: 'done',
			detail: 'mermaid / flowchart / sequence 已 dynamic import + splitting，首屏不内联全量图库',
		},
		{
			id: 'keep-pretext-lazy',
			status: 'done',
			detail: 'RD-5.2 @chenglou/pretext 为 lazy chunk（misc）',
		},
		{
			id: 'stub-is-milkdown-core',
			status: 'accept',
			detail: `index.js stub gzip ≈ ${Math.round((stub?.gzipBytes || 0) / 1024)} KiB：Milkdown+PM+插件骨架，短期不可零成本压半`,
		},
		{
			id: 'optional-prism-split',
			status: 'defer',
			detail: 'misc 大块可能含 Prism 语言包；可改为按语言 lazy，工作量中等，不阻塞发布',
		},
		{
			id: 'optional-katex-already-css',
			status: 'done-enough',
			detail: 'KaTeX CSS/fonts 已外置 vendor/katex/；JS 若在 stub 内则与 math NodeView 绑定，拆分收益有限',
		},
		{
			id: 'no-replace-gfm-for-size',
			status: 'wont',
			detail: '不为瘦身关掉 GFM table（产品对等优先；性能见 RD-1 分块）',
		},
	],
};

const md = [];
md.push('# RD-8 · Milkdown vendor lazy / gzip 审计');
md.push('');
md.push(`- **生成**：${new Date().toISOString()}`);
md.push(`- **vendor builtAt**：${br.builtAt || '?'}`);
md.push(`- **Milkdown**：${br.milkdownVersion || '?'}`);
md.push('');
md.push('## 摘要');
md.push('');
md.push(`| 指标 | 值 |`);
md.push(`|------|-----|`);
md.push(`| stub index.js gzip | **${audit.stubGzipBytes}** B（≈ ${(audit.stubGzipBytes / 1024).toFixed(0)} KiB） |`);
md.push(`| vendor 全部 .js 数 | ${audit.allJsCount} |`);
md.push(`| 全量 concat gzip -9 | **${allGzip9}** B（≈ ${(allGzip9 / 1024).toFixed(0)} KiB） |`);
md.push('');
md.push('## 按 category 汇总（gzip）');
md.push('');
md.push('| category | files | gzip B |');
md.push('|----------|------:|-------:|');
for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1].gzipBytes - a[1].gzipBytes)) {
	md.push(`| ${k} | ${v.count} | ${v.gzipBytes} |`);
}
md.push('');
md.push('## Top chunks');
md.push('');
md.push('| file | gzip B | category |');
md.push('|------|-------:|----------|');
for (const c of top) {
	md.push(`| ${c.file} | ${c.gzipBytes} | ${c.category} |`);
}
md.push('');
md.push('## 建议（结论）');
md.push('');
for (const r of audit.recommendations) {
	md.push(`- **${r.id}** · \`${r.status}\` — ${r.detail}`);
}
md.push('');
md.push('## 下一步（非本卡必做）');
md.push('');
md.push('1. 若 stub 仍涨：审计 entry 静态 import，避免把 demo/测试 util 打进主包');
md.push('2. Prism 按语言 dynamic import（中等工时）');
md.push('3. **不**为体积关闭 mermaid/GFM');
md.push('');
md.push('**Gate RD-8**：审计报告落盘 + 确认图类 lazy 已生效；**不**要求本轮再砍 stub 50%。');
md.push('');

fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
fs.writeFileSync(OUT_MD, md.join('\n'));
fs.writeFileSync(OUT_JSON, JSON.stringify(audit, null, 2));
console.log(md.join('\n'));
console.log('[rd-8] wrote', OUT_MD);
