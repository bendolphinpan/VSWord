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

/**
 * RD-9.3b · 合成 N 节点浅宽树（root + 若干一级子节点，各带子节点），用于 10k parse 实测。
 * 不写盘；仅内存 XML。
 */
function buildSyntheticMmXml(targetNodes) {
	// root + first-level groups of ~10 leaves each
	const leaves = Math.max(0, targetNodes - 1);
	const groupSize = 10;
	const groups = Math.ceil(leaves / groupSize);
	let parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<map version="1.0.1">', '<node ID="root" TEXT="Synthetic10k">'];
	let made = 1;
	for (let g = 0; g < groups && made < targetNodes; g++) {
		const gid = `g${g}`;
		parts.push(`<node ID="${gid}" TEXT="G${g}">`);
		made++;
		for (let i = 0; i < groupSize && made < targetNodes; i++) {
			parts.push(`<node ID="n${g}_${i}" TEXT="N${g}-${i}"/>`);
			made++;
		}
		parts.push('</node>');
	}
	parts.push('</node></map>');
	return parts.join('');
}

function benchXml(label, xml, parseMindmapXml, serializeMindmapXml, runs = 5) {
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
	return {
		label,
		bytes: Buffer.byteLength(xml, 'utf8'),
		nodeCount,
		runs,
		parseMsAvg: +avg(parseMs).toFixed(2),
		parseMsMax: +Math.max(...parseMs).toFixed(2),
		serializeMsAvg: +avg(serMs).toFixed(2),
		serializeMsMax: +Math.max(...serMs).toFixed(2),
		roundTripOk,
	};
}

const xml1k = fs.readFileSync(FIXTURE, 'utf8');
const { parseMindmapXml, serializeMindmapXml } = await loadParseSerialize();

const fixture1k = benchXml('large-1k-nodes.mm', xml1k, parseMindmapXml, serializeMindmapXml);
const synth10kXml = buildSyntheticMmXml(10_000);
const synth10k = benchXml('synthetic-10k-nodes', synth10kXml, parseMindmapXml, serializeMindmapXml, 3);

const result = {
	builtAt: new Date().toISOString(),
	fixture1k,
	synthetic10k: synth10k,
	// 保留 1k→10k 外推对照
	extrapolate10kParseMsFrom1k: +(fixture1k.parseMsAvg * (10000 / Math.max(1, fixture1k.nodeCount))).toFixed(1),
	notes: [
		'Node parse/serialize only — not mind-elixir layout/render.',
		'RD-9.3b: synthetic-10k is measured (not only extrapolated).',
		'Layout/render 10k remains out of scope for this probe.',
	],
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log('[rd-9] wrote', OUT);
