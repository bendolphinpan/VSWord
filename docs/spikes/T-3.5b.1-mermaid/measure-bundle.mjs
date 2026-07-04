#!/usr/bin/env node
// measure-bundle.mjs
// 目标：mermaid v11 各 chunk 在 raw + gzip 下的体积；分类：
//   - core entry (`dist/mermaid.core.mjs`) —— 唯一必然被首次 import 拉到的入口
//   - core chunks (`dist/chunks/mermaid.core/*.mjs`) —— 各图类型子 chunk
//   - 分组：每个"图类型"专属 chunk（文件名以图名开头）
// 输出：reports/bundle.json + 控制台表格

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { gzipSync } from 'node:zlib';

const CORE_ROOT = 'node_modules/mermaid/dist';
const CHUNK_DIR = join(CORE_ROOT, 'chunks/mermaid.core');

function measure(path) {
	const buf = readFileSync(path);
	return { raw: buf.length, gz: gzipSync(buf, { level: 9 }).length };
}

const entry = measure(join(CORE_ROOT, 'mermaid.core.mjs'));

const chunkFiles = readdirSync(CHUNK_DIR).filter(f => f.endsWith('.mjs'));
const chunks = chunkFiles.map(f => {
	const size = measure(join(CHUNK_DIR, f));
	return { file: f, raw: size.raw, gz: size.gz };
});
const totalChunks = {
	raw: chunks.reduce((a, c) => a + c.raw, 0),
	gz:  chunks.reduce((a, c) => a + c.gz, 0),
};

// —— 图类型专属 chunk 猜测：文件名以 <DiagramName>-XXXXXX.mjs 命名的当作专属；
//    其余（chunk-XXXX.mjs）是共享 runtime。
const perDiagram = {};
const sharedRuntime = { raw: 0, gz: 0, files: 0 };
for (const c of chunks) {
	const m = c.file.match(/^([A-Za-z][A-Za-z0-9]*)-[A-Z0-9]{6,}\.mjs$/);
	if (m && !m[1].startsWith('chunk')) {
		const key = m[1];
		if (!perDiagram[key]) perDiagram[key] = { raw: 0, gz: 0, files: 0 };
		perDiagram[key].raw += c.raw;
		perDiagram[key].gz  += c.gz;
		perDiagram[key].files += 1;
	} else {
		sharedRuntime.raw += c.raw;
		sharedRuntime.gz  += c.gz;
		sharedRuntime.files += 1;
	}
}

// 首次渲染成本估算：入口 + 共享 runtime + 单个图类型（取平均图类型）
const perDiagramGzAvg = Object.keys(perDiagram).length
	? Math.round(Object.values(perDiagram).reduce((a, d) => a + d.gz, 0) / Object.keys(perDiagram).length)
	: 0;
const firstFlowchartGz = entry.gz + sharedRuntime.gz + (perDiagram.flowchart?.gz || perDiagramGzAvg);

const report = {
	scanned: {
		entry: 'dist/mermaid.core.mjs',
		chunkDir: 'dist/chunks/mermaid.core',
		chunkCount: chunks.length,
	},
	entry,
	chunks: { count: chunks.length, total: totalChunks, sharedRuntime, perDiagramCount: Object.keys(perDiagram).length },
	perDiagram: Object.fromEntries(Object.entries(perDiagram).sort((a, b) => b[1].gz - a[1].gz)),
	firstRenderEstimate: {
		note: 'entry + sharedRuntime + one diagram chunk (flowchart if present, else avg)',
		gzBytes: firstFlowchartGz,
	},
	fullPackageAllChunksGz: entry.gz + totalChunks.gz,
};

console.log(JSON.stringify(report, null, 2));
