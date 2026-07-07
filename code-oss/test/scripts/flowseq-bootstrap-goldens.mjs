#!/usr/bin/env node
// T-3.5b-flowseq.3c · 首跑 golden bootstrap（一次性脚本）。
// 用法：node code-oss/test/scripts/flowseq-bootstrap-goldens.mjs
//
// 会 fork flow-render-worker + sequence-render-worker 各一次，把 normalized svg
// 写入 test/fixtures/{flow,sequence}/*.golden.svg，同时把 .md 文件写出（source of truth
// 来自 _index.mjs）。mixed fixture 只写 .md，跨库联合 diff 走单库 golden。

import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const FIX = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/test/fixtures');

function forkWorker(worker, iter, outJson) {
	const res = cp.spawnSync(process.execPath, [worker, '--iterations', String(iter), '--out', outJson], {
		encoding: 'utf8', cwd: REPO_ROOT, stdio: ['ignore', 'inherit', 'inherit'],
	});
	if (res.status !== 0) { throw new Error(`worker exit ${res.status}: ${worker}`); }
	return JSON.parse(fs.readFileSync(outJson, 'utf8'));
}

async function main() {
	const tmpDir = path.join(CODE_OSS, 'test', 'reports');
	fs.mkdirSync(tmpDir, { recursive: true });
	const flowOut = path.join(tmpDir, `_flow-bootstrap-${Date.now()}.json`);
	const seqOut = path.join(tmpDir, `_seq-bootstrap-${Date.now()}.json`);

	process.stderr.write('[bootstrap] flow worker...\n');
	const flowPayload = forkWorker(path.join(CODE_OSS, 'test/scripts/flow-render-worker.mjs'), 1, flowOut);
	process.stderr.write('[bootstrap] sequence worker...\n');
	const seqPayload = forkWorker(path.join(CODE_OSS, 'test/scripts/sequence-render-worker.mjs'), 1, seqOut);

	const { FLOW_FIXTURES, toMarkdown: flowMd } = await import(pathToFileURL(path.join(FIX, 'flow/_index.mjs')).href);
	const { SEQUENCE_FIXTURES, toMarkdown: seqMd } = await import(pathToFileURL(path.join(FIX, 'sequence/_index.mjs')).href);
	const { MIXED_FIXTURES, toMarkdown: mixedMd } = await import(pathToFileURL(path.join(FIX, 'mixed/_index.mjs')).href);

	for (const f of FLOW_FIXTURES) {
		fs.writeFileSync(path.join(FIX, 'flow', f.id + '.md'), flowMd(f.src), 'utf8');
		const r = flowPayload.results.find(x => x.id === f.id);
		if (r && r.ok) {
			fs.writeFileSync(path.join(FIX, 'flow', f.id + '.golden.svg'), r.iterations[0].normalized, 'utf8');
			process.stderr.write(`  flow  · ${f.id} · ${r.iterations[0].normBytes} bytes\n`);
		} else {
			process.stderr.write(`  flow  · ${f.id} · SKIP (${r && r.error || 'not found'})\n`);
		}
	}
	for (const f of SEQUENCE_FIXTURES) {
		fs.writeFileSync(path.join(FIX, 'sequence', f.id + '.md'), seqMd(f.src), 'utf8');
		const r = seqPayload.results.find(x => x.id === f.id);
		if (r && r.ok) {
			fs.writeFileSync(path.join(FIX, 'sequence', f.id + '.golden.svg'), r.iterations[0].normalized, 'utf8');
			process.stderr.write(`  seq   · ${f.id} · ${r.iterations[0].normBytes} bytes\n`);
		} else {
			process.stderr.write(`  seq   · ${f.id} · SKIP (${r && r.error || 'not found'})\n`);
		}
	}
	for (const f of MIXED_FIXTURES) {
		fs.writeFileSync(path.join(FIX, 'mixed', f.id + '.md'), mixedMd(f.segments), 'utf8');
		process.stderr.write(`  mixed · ${f.id} · md only\n`);
	}

	try { fs.unlinkSync(flowOut); } catch { /* ok */ }
	try { fs.unlinkSync(seqOut); } catch { /* ok */ }
	process.stderr.write('[bootstrap] done\n');
}

main().catch(e => { process.stderr.write('[bootstrap] fatal: ' + (e && e.stack || e) + '\n'); process.exit(2); });
