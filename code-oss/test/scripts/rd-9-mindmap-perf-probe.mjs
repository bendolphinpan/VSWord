#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  RD-9.3 · Mindmap 1k 节点 parse/serialize 耗时探针（Node，非 Electron 渲染）
 *  用法：node code-oss/test/scripts/rd-9-mindmap-perf-probe.mjs
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const FIXTURE = path.join(
	CODE_OSS,
	'src/vs/workbench/contrib/vsword/test/fixtures/mindmap/large-1k-nodes.mm',
);
const OUT = path.join(CODE_OSS, 'test', 'reports', 'rd-9-mindmap-perf.json');

// mindmapXml is TS — use compiled out if present, else skip with note
const OUT_JS = path.join(
	CODE_OSS,
	'out/vs/workbench/contrib/vsword/common/mindmapXml.js',
);
const SRC_TS = path.join(
	CODE_OSS,
	'src/vs/workbench/contrib/vsword/common/mindmapXml.ts',
);

async function loadParseSerialize() {
	if (fs.existsSync(OUT_JS)) {
		const mod = await import(pathToFileURL(OUT_JS).href);
		return { parseMindmapXml: mod.parseMindmapXml, serializeMindmapXml: mod.serializeMindmapXml };
	}
	// Fallback: run via esbuild-bundle of the TS module using milkdown builder esbuild
	const BUILDER = path.resolve(CODE_OSS, '..', '.tmp', 'milkdown-prod-builder', 'node_modules', 'esbuild');
	if (!fs.existsSync(BUILDER)) {
		throw new Error('Need compiled out/ or milkdown-prod-builder esbuild. Run compile or milkdown build first.');
	}
	const esbuild = (await import(pathToFileURL(path.join(BUILDER, 'lib', 'main.js')).href)).default;
	const tmp = path.join(CODE_OSS, '.tmp-rd9-mindmap-perf.mjs');
	await esbuild.build({
		entryPoints: [SRC_TS],
		bundle: true,
		format: 'esm',
		platform: 'node',
		outfile: tmp,
		loader: { '.ts': 'ts' },
		external: [],
		logLevel: 'error',
	});
	const mod = await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
	return { parseMindmapXml: mod.parseMindmapXml, serializeMindmapXml: mod.serializeMindmapXml };
}

function countNodes(root) {
	if (!root) return 0;
	let n = 1;
	for (const c of root.children || []) { n += countNodes(c); }
	return n;
}

if (!fs.existsSync(FIXTURE)) {
	console.error('[rd-9] missing fixture', FIXTURE);
	process.exit(1);
}

const xml = fs.readFileSync(FIXTURE, 'utf8');
const { parseMindmapXml, serializeMindmapXml } = await loadParseSerialize();

const runs = 5;
const parseMs = [];
const serMs = [];
let nodeCount = 0;
let roundTripOk = true;

for (let i = 0; i < runs; i++) {
	const t0 = performance.now();
	const doc = parseMindmapXml(xml);
	parseMs.push(performance.now() - t0);
	if (i === 0) {
		nodeCount = countNodes(doc.root);
	}
	const t1 = performance.now();
	const out = serializeMindmapXml(doc);
	serMs.push(performance.now() - t1);
	if (out !== xml) { roundTripOk = false; }
}

const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const result = {
	builtAt: new Date().toISOString(),
	fixture: 'large-1k-nodes.mm',
	bytes: Buffer.byteLength(xml, 'utf8'),
	nodeCount,
	runs,
	parseMsAvg: +avg(parseMs).toFixed(2),
	parseMsMax: +Math.max(...parseMs).toFixed(2),
	serializeMsAvg: +avg(serMs).toFixed(2),
	serializeMsMax: +Math.max(...serMs).toFixed(2),
	roundTripOk,
	// 10k 节点：用 1k 线性外推（仅数量级参考）
	extrapolate10kParseMs: +(avg(parseMs) * (10000 / Math.max(1, nodeCount))).toFixed(1),
	notes: [
		'Node parse/serialize only — not mind-elixir layout/render.',
		'10k extrapolate assumes linear scaling (layout may be superlinear).',
	],
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log('[rd-9] wrote', OUT);
