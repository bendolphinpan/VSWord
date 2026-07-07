/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5b-flowseq.3c · Mixed round-trip：mermaid + flow + sequence 同文档 round-trip 保真
//
// 每个 mixed fixture 拆成若干 segment，各自送对应 worker 渲染，
// normalized svg 与其在单库 fixture 里的 golden/expected 逐字节比对。
// 不维护 mixed 自己的 golden — 通过引用单库 golden 保证 SSOT 只有一份。

import * as assert from 'assert';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
// @ts-ignore — 通过 barrel 引入的 .mjs SSOT
import { MIXED_FIXTURES } from '../fixtures/mixed/_index.mjs';

const CODE_OSS = process.cwd().endsWith('code-oss') ? process.cwd() : path.resolve(process.cwd(), 'code-oss');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const FIXTURE_ROOT = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/test/fixtures');

const WORKERS = {
	mermaid: path.resolve(CODE_OSS, 'test/scripts/mermaid-render-worker.mjs'),
	flow: path.resolve(CODE_OSS, 'test/scripts/flow-render-worker.mjs'),
	sequence: path.resolve(CODE_OSS, 'test/scripts/sequence-render-worker.mjs'),
} as const;

const GOLDEN_LOOKUP: Record<string, (id: string) => string> = {
	mermaid: (id) => path.join(FIXTURE_ROOT, 'mermaid', `${id}.expected.svg`),
	flow: (id) => path.join(FIXTURE_ROOT, 'flow', `${id}.golden.svg`),
	sequence: (id) => path.join(FIXTURE_ROOT, 'sequence', `${id}.golden.svg`),
};

interface Iter { ok: boolean; normalized?: string; error?: string; }
interface WResult { id: string; ok: boolean; error: string | null; iterations: Iter[]; }
interface Payload { results: WResult[]; }

function forkWorker(worker: string, ids: string[]): Payload {
	const tmpOut = path.join(REPO_ROOT, `code-oss/test/reports/_mixed-${path.basename(worker, '.mjs')}-${Date.now()}.json`);
	fs.mkdirSync(path.dirname(tmpOut), { recursive: true });
	const res = cp.spawnSync(process.execPath, [worker, '--ids', ids.join(','), '--iterations', '1', '--out', tmpOut], {
		encoding: 'utf8', cwd: REPO_ROOT, stdio: ['ignore', 'inherit', 'inherit'],
	});
	if (res.status !== 0) { throw new Error(`${path.basename(worker)} exit ${res.status}`); }
	const p = JSON.parse(fs.readFileSync(tmpOut, 'utf8')) as Payload;
	try { fs.unlinkSync(tmpOut); } catch { /* keep */ }
	return p;
}

interface Segment { lang: 'mermaid' | 'flow' | 'sequence'; fixtureId: string; src: string; }
interface MixedFixture { id: string; segments: Segment[]; }

const cache = new Map<string, Payload>();
function getPayload(lang: keyof typeof WORKERS, ids: string[]): Payload {
	const key = lang + '|' + ids.sort().join(',');
	let p = cache.get(key);
	if (!p) { p = forkWorker(WORKERS[lang], ids); cache.set(key, p); }
	return p;
}

suite('T-3.5b-flowseq.3c · Mixed round-trip · mermaid+flow+sequence 单文档', function () {
	// eslint-disable-next-line no-invalid-this
	this.timeout(120_000);

	// 预热：一次性把每个 lang 需要跑的 fixtureId 全部集齐，
	// 减少 mocha test 里的 worker fork 次数。
	suiteSetup(() => {
		const byLang: Record<string, Set<string>> = { mermaid: new Set(), flow: new Set(), sequence: new Set() };
		for (const mf of MIXED_FIXTURES as MixedFixture[]) {
			for (const seg of mf.segments) { byLang[seg.lang].add(seg.fixtureId); }
		}
		for (const lang of Object.keys(byLang) as Array<keyof typeof WORKERS>) {
			const ids = [...byLang[lang]];
			if (ids.length > 0) { getPayload(lang, ids); }
		}
	});

	for (const mf of MIXED_FIXTURES as MixedFixture[]) {
		for (const seg of mf.segments) {
			test(`[mixed/${mf.id}] ${seg.lang}/${seg.fixtureId} · normalized svg == golden`, () => {
				const ids = (MIXED_FIXTURES as MixedFixture[])
					.flatMap(x => x.segments)
					.filter(x => x.lang === seg.lang)
					.map(x => x.fixtureId);
				const payload = getPayload(seg.lang, [...new Set(ids)]);
				const r = payload.results.find(x => x.id === seg.fixtureId);
				assert.ok(r, `worker payload missing ${seg.lang}/${seg.fixtureId}`);
				assert.strictEqual(r!.ok, true, `render fail: ${r!.error}`);
				const normalized = r!.iterations[0].normalized || '';
				assert.ok(normalized.length > 0, `empty normalized svg for ${seg.lang}/${seg.fixtureId}`);
				const goldenPath = GOLDEN_LOOKUP[seg.lang](seg.fixtureId);
				assert.ok(fs.existsSync(goldenPath), `missing golden ${goldenPath}`);
				const golden = fs.readFileSync(goldenPath, 'utf8');
				if (golden !== normalized) {
					let firstDiff = -1;
					const min = Math.min(golden.length, normalized.length);
					for (let i = 0; i < min; i++) { if (golden[i] !== normalized[i]) { firstDiff = i; break; } }
					if (firstDiff < 0) { firstDiff = min; }
					const around = (s: string) => JSON.stringify(s.slice(Math.max(0, firstDiff - 40), firstDiff + 80));
					assert.fail(
						`svg diff for ${seg.lang}/${seg.fixtureId} at offset ${firstDiff}\n  golden(len=${golden.length}): ${around(golden)}\n  actual(len=${normalized.length}): ${around(normalized)}`
					);
				}
			});
		}
	}
});
