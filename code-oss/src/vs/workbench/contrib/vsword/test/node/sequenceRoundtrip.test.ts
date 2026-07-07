/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5b-flowseq.3c · Sequence round-trip 保真度测试

import * as assert from 'assert';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
// @ts-ignore — 通过 barrel 引入的 .mjs SSOT
import { SEQUENCE_FIXTURES } from '../fixtures/sequence/_index.mjs';

const CODE_OSS = process.cwd().endsWith('code-oss') ? process.cwd() : path.resolve(process.cwd(), 'code-oss');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const FIXTURE_DIR = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/test/fixtures/sequence');
const WORKER = path.resolve(CODE_OSS, 'test/scripts/sequence-render-worker.mjs');

interface WorkerIter { ok: boolean; ms: number; svgBytes?: number; normBytes?: number; normalized?: string; error?: string; }
interface WorkerResult { id: string; tier: string; ok: boolean; error: string | null; iterations: WorkerIter[]; }
interface WorkerPayload { sequenceVersion: string; raphaelVersion: string; underscoreVersion: string; builder: string; iterations: number; total: number; okCount: number; failCount: number; results: WorkerResult[]; }

let cachedPayload: WorkerPayload | null = null;

function runWorkerOnce(): WorkerPayload {
	if (cachedPayload) { return cachedPayload; }
	const tmpOut = path.join(REPO_ROOT, `code-oss/test/reports/_seq-roundtrip-${Date.now()}.json`);
	fs.mkdirSync(path.dirname(tmpOut), { recursive: true });
	const res = cp.spawnSync(process.execPath, [WORKER, '--iterations', '1', '--out', tmpOut], {
		encoding: 'utf8', cwd: REPO_ROOT, stdio: ['ignore', 'inherit', 'inherit'],
	});
	if (res.status !== 0) { throw new Error(`sequence-render-worker exited with status ${res.status}`); }
	if (!fs.existsSync(tmpOut)) { throw new Error(`sequence-render-worker did not produce ${tmpOut}`); }
	cachedPayload = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
	try { fs.unlinkSync(tmpOut); } catch { /* keep */ }
	return cachedPayload!;
}

suite('T-3.5b-flowseq.3c · Sequence round-trip · golden svg diff', function () {
	// eslint-disable-next-line no-invalid-this
	this.timeout(90_000);

	let payload: WorkerPayload;
	suiteSetup(() => {
		payload = runWorkerOnce();
	});

	test(`worker: ${SEQUENCE_FIXTURES.length}/${SEQUENCE_FIXTURES.length} render 成功`, () => {
		assert.strictEqual(payload.total, SEQUENCE_FIXTURES.length, `expected ${SEQUENCE_FIXTURES.length} fixtures, got ${payload.total}`);
		assert.strictEqual(payload.failCount, 0, `render failed for ${payload.results.filter(r => !r.ok).map(r => r.id).join(', ')}`);
	});

	for (const fx of SEQUENCE_FIXTURES as Array<{ id: string; tier: string }>) {
		test(`[seq/${fx.tier}] ${fx.id} · normalized svg == golden`, () => {
			const r = payload.results.find(x => x.id === fx.id);
			assert.ok(r, `worker payload missing fixture id=${fx.id}`);
			assert.strictEqual(r!.ok, true, `render fail for ${fx.id}: ${r!.error}`);
			const it = r!.iterations[0];
			const normalized = it.normalized || '';
			assert.ok(normalized.length > 0, `empty normalized svg for ${fx.id}`);
			const goldenPath = path.join(FIXTURE_DIR, `${fx.id}.golden.svg`);
			if (!fs.existsSync(goldenPath)) {
				fs.writeFileSync(goldenPath, normalized, 'utf8');
				return;
			}
			const golden = fs.readFileSync(goldenPath, 'utf8');
			if (golden !== normalized) {
				let firstDiff = -1;
				const min = Math.min(golden.length, normalized.length);
				for (let i = 0; i < min; i++) { if (golden[i] !== normalized[i]) { firstDiff = i; break; } }
				if (firstDiff < 0) { firstDiff = min; }
				const around = (s: string) => JSON.stringify(s.slice(Math.max(0, firstDiff - 40), firstDiff + 80));
				assert.fail(
					`svg diff for ${fx.id} at offset ${firstDiff}\n  golden(len=${golden.length}): ${around(golden)}\n  actual(len=${normalized.length}): ${around(normalized)}`
				);
			}
		});
	}
});
