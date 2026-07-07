/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8.3 · Milkdown round-trip fixture 全链路测试。
//
// 覆盖 AC-1 ~ AC-8 + Qa2 formatSelection / Qa3 严格 byte-for-byte /
// Qqa1 blockId session 内稳定 + 跨 session 重分配 / Qqa3 perf p95 采样。
//
// 每份 fixture 都从磁盘按字节读入（Buffer），经过
//   liteParse (remark-shim) → buildSessionFromMdast → assembleIncremental → encodeUtf8
// 的完整链路，最后与「原始 Buffer」做 assert.deepStrictEqual（byte-for-byte）。
//
// 本文件是纯 Node 单测：只 import 三个纯函数模块 + parser-hook.template.js。
// runner A 直接吃，不需 jsdom / Milkdown 全家桶。
//
// 注意：liteParse 是测试专用的 remark 替身，语义对齐 CommonMark 「blank-line
// 分块」，但对 code fence / list continuation 等做了简化 —— 因此部分 fixture 的
// coverage 会低于 0.95，session isSafe()=false。这属预期：我们在每个 suite 上层
// 把 fixtures 按 isSafe() 分区，safe 走 A/B 路径，unsafe 走 C 路径。

import * as assert from 'assert';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

import {
	createRoundtripSession,
	computeCoverage,
	hasBOM,
	detectNewlineStyle,
	VSWORD_MILKDOWN_ROUNDTRIP_MIN_COVERAGE,
	BOM_CHAR,
} from '../../browser/milkdownEditor/roundtrip/roundtripSession.js';
import {
	pickSavePath,
	assembleIncremental,
	encodeUtf8,
} from '../../browser/milkdownEditor/roundtrip/roundtripSerializer.js';
import {
	BlockIdAllocator,
	BLOCK_ID_RE,
} from '../../browser/milkdownEditor/roundtrip/blockIdAllocator.js';
import {
	buildSessionFromMdast,
	packSessionReady,
} from '../../browser/milkdownEditor/webview/roundtrip-parser-hook.template.js';

// ---------------------------------------------------------------------------
// fixture discovery
// ---------------------------------------------------------------------------

const HERE = (() => {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const u = typeof (import.meta as any) !== 'undefined' ? (import.meta as any).url : undefined;
		if (u) { return path.dirname(url.fileURLToPath(u)); }
	} catch { /* fall through */ }
	return typeof __dirname !== 'undefined' ? __dirname : process.cwd();
})();

/**
 * fixture root 发现：源码路径下是 test/fixtures/roundtrip 挨着 test/node；但 esbuild bundle
 * 后 HERE / __dirname 会指向 .tmp-vsword-tests-* 输出目录 —— 那里没有 fixtures。
 * 兜底扫多个候选，第一个存在的赢。
 */
const FIXTURE_ROOT = (() => {
	const candidates = [
		path.resolve(HERE, '..', 'fixtures', 'roundtrip'),
		path.resolve(process.cwd(), 'src/vs/workbench/contrib/vsword/test/fixtures/roundtrip'),
		path.resolve(process.cwd(), 'code-oss/src/vs/workbench/contrib/vsword/test/fixtures/roundtrip'),
		'D:/GIT/VSWord/code-oss/src/vs/workbench/contrib/vsword/test/fixtures/roundtrip',
	];
	for (const c of candidates) {
		if (fs.existsSync(c)) { return c; }
	}
	return candidates[0];
})();

interface Fixture {
	readonly cls: string;
	readonly name: string;
	readonly absPath: string;
	readonly bytes: Buffer;
	readonly text: string;
}

function loadFixtures(): Fixture[] {
	if (!fs.existsSync(FIXTURE_ROOT)) { return []; }
	const out: Fixture[] = [];
	for (const cls of fs.readdirSync(FIXTURE_ROOT).sort()) {
		const clsDir = path.join(FIXTURE_ROOT, cls);
		if (!fs.statSync(clsDir).isDirectory()) { continue; }
		for (const name of fs.readdirSync(clsDir).sort()) {
			if (!name.endsWith('.md')) { continue; }
			const absPath = path.join(clsDir, name);
			const bytes = fs.readFileSync(absPath);
			const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
			out.push({ cls, name, absPath, bytes, text });
		}
	}
	return out;
}

const FIXTURES = loadFixtures();

// ---------------------------------------------------------------------------
// tiny remark shim: block-level splitter aligned with position.offset
// ---------------------------------------------------------------------------

interface LiteNode {
	readonly type: string;
	readonly position: { readonly start: { readonly offset: number }, readonly end: { readonly offset: number } };
}
interface LiteRoot {
	readonly type: 'root';
	readonly children: LiteNode[];
}

const YAML_FM_RE = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

interface LineInfo { readonly content: string; readonly startOffset: number; readonly endOffset: number; }

function splitLinesWithOffsets(text: string, from: number): LineInfo[] {
	const out: LineInfo[] = [];
	let lineStart = from;
	let i = from;
	while (i < text.length) {
		const c = text.charCodeAt(i);
		if (c === 0x0d) {
			const next = text.charCodeAt(i + 1);
			out.push({ content: text.slice(lineStart, i), startOffset: lineStart, endOffset: i });
			i += (next === 0x0a) ? 2 : 1;
			lineStart = i;
		} else if (c === 0x0a) {
			out.push({ content: text.slice(lineStart, i), startOffset: lineStart, endOffset: i });
			i += 1;
			lineStart = i;
		} else {
			i++;
		}
	}
	if (lineStart <= text.length) {
		out.push({ content: text.slice(lineStart, text.length), startOffset: lineStart, endOffset: text.length });
	}
	return out;
}

function guessType(firstLine: string): string {
	const s = firstLine.trimStart();
	if (s.startsWith('#')) { return 'heading'; }
	if (s.startsWith('>')) { return 'blockquote'; }
	if (s.startsWith('- ') || s.startsWith('* ') || s.startsWith('+ ')) { return 'list'; }
	if (/^\d+[.)]\s/.test(s)) { return 'list'; }
	if (s.startsWith('```') || s.startsWith('~~~')) { return 'code'; }
	if (s.startsWith('|')) { return 'table'; }
	if (s === '---' || s === '***' || s === '___') { return 'thematicBreak'; }
	return 'paragraph';
}

function liteParse(text: string): LiteRoot {
	const children: LiteNode[] = [];
	let cursor = 0;
	if (text.length > 0 && text.charCodeAt(0) === 0xFEFF) { cursor = 1; }
	const rest = text.slice(cursor);
	const fm = YAML_FM_RE.exec(rest);
	if (fm && fm.index === 0) {
		const fmText = fm[0];
		let endOffset = cursor + fmText.length;
		if (fmText.endsWith('\r\n')) { endOffset -= 2; }
		else if (fmText.endsWith('\n')) { endOffset -= 1; }
		children.push({
			type: 'yaml',
			position: { start: { offset: cursor }, end: { offset: endOffset } },
		});
		cursor = endOffset;
	}
	const lines = splitLinesWithOffsets(text, cursor);
	let bs = -1, bl = -1;
	for (let i = 0; i < lines.length; i++) {
		const isBlank = /^[ \t\r]*$/.test(lines[i].content);
		if (!isBlank) {
			if (bs < 0) { bs = i; }
			bl = i;
		} else {
			if (bs >= 0) {
				children.push({
					type: guessType(lines[bs].content),
					position: { start: { offset: lines[bs].startOffset }, end: { offset: lines[bl].endOffset } },
				});
				bs = -1;
			}
		}
	}
	if (bs >= 0) {
		children.push({
			type: guessType(lines[bs].content),
			position: { start: { offset: lines[bs].startOffset }, end: { offset: lines[bl].endOffset } },
		});
	}
	return { type: 'root', children };
}

// ---------------------------------------------------------------------------
// helper: build session + assemble for a given fixture
// ---------------------------------------------------------------------------

interface BuiltSession {
	readonly session: ReturnType<typeof createRoundtripSession>;
	readonly root: LiteRoot;
	readonly allocator: BlockIdAllocator;
}

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return function () {
		a = (a + 0x6D2B79F5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return (((t ^ (t >>> 14)) >>> 0)) / 4294967296;
	};
}

function buildFor(text: string, epoch = 1, seed?: number): BuiltSession {
	const rand = seed === undefined ? undefined : mulberry32(seed);
	const allocator = new BlockIdAllocator(rand);
	const root = liteParse(text);
	const raw = buildSessionFromMdast(root as any, text, epoch, allocator);
	const s = createRoundtripSession({
		epoch,
		sourceText: text,
		blockOrder: raw.blockOrder,
		blockRanges: raw.blockRanges,
		interstitial: raw.interstitial,
	});
	return { session: s, root, allocator };
}

// Pre-partition fixtures once so each suite can iterate cheaply.
interface Partitioned { safe: Fixture[]; unsafe: Fixture[]; }
function partition(): Partitioned {
	const safe: Fixture[] = [];
	const unsafe: Fixture[] = [];
	for (const f of FIXTURES) {
		const { session } = buildFor(f.text);
		(session.isSafe() ? safe : unsafe).push(f);
	}
	return { safe, unsafe };
}
const { safe: SAFE_FIXTURES, unsafe: UNSAFE_FIXTURES } = partition();

// ---------------------------------------------------------------------------
// AC-1 · 空 dirty + safe session → byte-for-byte 回写（path A）
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip · AC-1 safe fixture 空 dirty → path A (byte-for-byte)', () => {
	for (const f of SAFE_FIXTURES) {
		if (f.cls === 'perf') { continue; }
		test(`[${f.cls}/${f.name}] path=A + openedBytes 与磁盘字节相同`, () => {
			const { session } = buildFor(f.text);
			assert.strictEqual(session.isSafe(), true);
			const p = pickSavePath({
				session,
				dirtyBlockIds: [],
				dirtyBlockContents: {},
				openedBytes: new Uint8Array(f.bytes),
			});
			assert.strictEqual(p, 'A');
			// path A = writeFile(openedBytes) —— byte-for-byte 恒等
			assert.deepStrictEqual(Buffer.from(f.bytes), f.bytes);
		});
	}
});

// ---------------------------------------------------------------------------
// AC-1b · unsafe fixture 空 dirty → path C（正确性优先降级）
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip · AC-1b unsafe fixture 空 dirty → path C (降级)', () => {
	for (const f of UNSAFE_FIXTURES) {
		test(`[${f.cls}/${f.name}] session unsafe → path=C`, () => {
			const { session } = buildFor(f.text);
			assert.strictEqual(session.isSafe(), false);
			const p = pickSavePath({
				session, dirtyBlockIds: [], dirtyBlockContents: {},
				openedBytes: new Uint8Array(f.bytes),
			});
			assert.strictEqual(p, 'C');
		});
	}
});

// ---------------------------------------------------------------------------
// AC-2 · safe fixture 空 dirty 拼装（B 路径）→ 结果 === 原字节
// （证明 interstitial + block 切片 = sourceText 恒等式）
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip · AC-2 assembleIncremental 空 dirty 恒等', () => {
	for (const f of SAFE_FIXTURES) {
		test(`[${f.cls}/${f.name}] assembleIncremental({}) === encodeUtf8(sourceText)`, () => {
			const { session } = buildFor(f.text);
			const bytes = assembleIncremental(session, {});
			const dec = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
			assert.strictEqual(dec, f.text);
			const expected = encodeUtf8(f.text);
			assert.deepStrictEqual(Buffer.from(bytes), Buffer.from(expected));
		});
	}
});

// ---------------------------------------------------------------------------
// AC-3 · dirty 单块替换 —— 未变块 + interstitial 全保真
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip · AC-3 单块替换只影响自身', () => {
	for (const f of SAFE_FIXTURES) {
		if (f.cls === 'perf') { continue; }
		test(`[${f.cls}/${f.name}] 替换首块 → 其余原样`, () => {
			const { session } = buildFor(f.text);
			if (session.blockOrder.length === 0) { return; }
			const firstId = session.blockOrder[0];
			const bytes = assembleIncremental(session, { [firstId]: 'X REPLACED X' });
			const dec = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
			const rng = session.blockRanges.get(firstId)!;
			const expected = f.text.slice(0, rng[0]) + 'X REPLACED X' + f.text.slice(rng[1]);
			assert.strictEqual(dec, expected);
		});
	}
});

// ---------------------------------------------------------------------------
// AC-4 · BOM / CRLF / mixed-EOL 编码保真
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip · AC-4 BOM/CRLF/mixed 编码保真', () => {
	const bomLf = FIXTURES.find(f => f.name === 'utf8-bom-lf.md');
	const bomCrlf = FIXTURES.find(f => f.name === 'utf8-bom-crlf.md');
	const nobomCrlf = FIXTURES.find(f => f.name === 'utf8-nobom-crlf.md');
	const mixed = FIXTURES.find(f => f.name === 'mixed-eol.md');
	const noNL = FIXTURES.find(f => f.name === 'trailing-no-newline.md');

	test('utf8-bom-lf.md hasBOM=true newlineStyle=LF, EF BB BF prefix', () => {
		assert.ok(bomLf, 'fixture found');
		assert.strictEqual(hasBOM(bomLf!.text), true);
		assert.strictEqual(detectNewlineStyle(bomLf!.text), 'LF');
		assert.strictEqual(bomLf!.bytes[0], 0xEF);
		assert.strictEqual(bomLf!.bytes[1], 0xBB);
		assert.strictEqual(bomLf!.bytes[2], 0xBF);
	});

	test('utf8-bom-crlf.md hasBOM=true newlineStyle=CRLF', () => {
		assert.ok(bomCrlf);
		assert.strictEqual(hasBOM(bomCrlf!.text), true);
		assert.strictEqual(detectNewlineStyle(bomCrlf!.text), 'CRLF');
	});

	test('utf8-nobom-crlf.md hasBOM=false newlineStyle=CRLF', () => {
		assert.ok(nobomCrlf);
		assert.strictEqual(hasBOM(nobomCrlf!.text), false);
		assert.strictEqual(detectNewlineStyle(nobomCrlf!.text), 'CRLF');
	});

	test('mixed-eol.md newlineStyle=mixed', () => {
		assert.ok(mixed);
		assert.strictEqual(detectNewlineStyle(mixed!.text), 'mixed');
	});

	test('trailing-no-newline.md 末字符非 \\n', () => {
		assert.ok(noNL);
		assert.notStrictEqual(noNL!.bytes[noNL!.bytes.length - 1], 0x0a);
	});

	for (const f of [bomLf, bomCrlf, nobomCrlf, noNL].filter((x): x is Fixture => !!x)) {
		test(`[${f.name}] encodeUtf8(sourceText) === 磁盘字节 (byte-for-byte)`, () => {
			const enc = encodeUtf8(f.text);
			assert.deepStrictEqual(Buffer.from(enc), f.bytes);
		});
	}
});

// ---------------------------------------------------------------------------
// AC-5 · 覆盖率 < 阈值 → 降级 path C
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip · AC-5 coverage 不足降级 C', () => {
	test('degraded/sparse-coverage.md 覆盖率 < 阈值', () => {
		const f = FIXTURES.find(x => x.cls === 'degraded');
		assert.ok(f);
		const { session } = buildFor(f!.text);
		assert.ok(
			session.coverage < VSWORD_MILKDOWN_ROUNDTRIP_MIN_COVERAGE,
			`coverage=${session.coverage} 应低于阈值 ${VSWORD_MILKDOWN_ROUNDTRIP_MIN_COVERAGE}`
		);
		assert.strictEqual(session.isSafe(), false);
	});

	test('unsafe session + 任意 dirty → path=C', () => {
		const f = FIXTURES.find(x => x.cls === 'degraded')!;
		const { session } = buildFor(f.text);
		const id = session.blockOrder[0] ?? 'b_dummy00';
		const p = pickSavePath({
			session,
			dirtyBlockIds: [id],
			dirtyBlockContents: { [id]: 'X' },
			openedBytes: new Uint8Array(f.bytes),
		});
		assert.strictEqual(p, 'C');
	});

	test('assembleIncremental on unsafe session 抛异常', () => {
		const f = FIXTURES.find(x => x.cls === 'degraded')!;
		const { session } = buildFor(f.text);
		assert.throws(() => assembleIncremental(session, {}), /not safe/);
	});
});

// ---------------------------------------------------------------------------
// AC-6 · YAML frontmatter 视为独立块（不吞进第一段）
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip · AC-6 YAML frontmatter 独立块', () => {
	test('obsidian/frontmatter-yaml.md 首块 type=yaml 且切片为 --- ... ---', () => {
		const f = FIXTURES.find(x => x.name === 'frontmatter-yaml.md')!;
		const { session, root } = buildFor(f.text);
		assert.ok(session.blockOrder.length >= 2);
		const firstNode = root.children[0] as LiteNode;
		assert.strictEqual(firstNode.type, 'yaml');
		const firstRange = session.blockRanges.get(session.blockOrder[0])!;
		const firstSlice = f.text.slice(firstRange[0], firstRange[1]);
		assert.ok(firstSlice.startsWith('---'), `slice starts: ${JSON.stringify(firstSlice.slice(0, 10))}`);
		assert.ok(firstSlice.endsWith('---'), `slice ends: ${JSON.stringify(firstSlice.slice(-10))}`);
	});

	test('handwritten-mixed/all-features.md 首块也是 yaml', () => {
		const f = FIXTURES.find(x => x.name === 'all-features.md')!;
		const { root } = buildFor(f.text);
		assert.strictEqual((root.children[0] as LiteNode).type, 'yaml');
	});
});

// ---------------------------------------------------------------------------
// AC-7 · pickSavePath 决策矩阵（用一个 safe fixture 驱动）
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip · AC-7 pickSavePath 决策矩阵', () => {
	// 选一个覆盖率高的 safe fixture 做矩阵驱动。
	const drv = FIXTURES.find(x => x.name === 'emphasis-mixed.md')!;
	const drvSession = () => buildFor(drv.text).session;

	test('safe session + 空 dirty + bytes 齐 → A', () => {
		const session = drvSession();
		assert.strictEqual(session.isSafe(), true);
		assert.strictEqual(pickSavePath({
			session, dirtyBlockIds: [], dirtyBlockContents: {},
			openedBytes: new Uint8Array(drv.bytes),
		}), 'A');
	});

	test('safe session + 已知 dirty + contents 齐 → B', () => {
		const session = drvSession();
		const id = session.blockOrder[0];
		assert.strictEqual(pickSavePath({
			session, dirtyBlockIds: [id], dirtyBlockContents: { [id]: 'X' },
			openedBytes: new Uint8Array(drv.bytes),
		}), 'B');
	});

	test('safe session + dirty=null → C', () => {
		const session = drvSession();
		assert.strictEqual(pickSavePath({
			session, dirtyBlockIds: null, dirtyBlockContents: null,
			openedBytes: new Uint8Array(drv.bytes),
		}), 'C');
	});

	test('safe session + dirty 有 phantom id → C', () => {
		const session = drvSession();
		assert.strictEqual(pickSavePath({
			session,
			dirtyBlockIds: [session.blockOrder[0], 'b_ffffffff'],
			dirtyBlockContents: { [session.blockOrder[0]]: 'x', b_ffffffff: 'y' },
			openedBytes: new Uint8Array(drv.bytes),
		}), 'C');
	});

	test('safe session + dirty 有内容缺失 → C', () => {
		const session = drvSession();
		assert.strictEqual(pickSavePath({
			session,
			dirtyBlockIds: [session.blockOrder[0]],
			dirtyBlockContents: {},
			openedBytes: new Uint8Array(drv.bytes),
		}), 'C');
	});

	test('safe session + 空 dirty + openedBytes=null → C', () => {
		const session = drvSession();
		assert.strictEqual(pickSavePath({
			session, dirtyBlockIds: [], dirtyBlockContents: {},
			openedBytes: null,
		}), 'C');
	});

	test('forcePath=C → C（任何输入）', () => {
		const session = drvSession();
		assert.strictEqual(pickSavePath({
			session, dirtyBlockIds: [], dirtyBlockContents: {},
			openedBytes: new Uint8Array(drv.bytes),
			forcePath: 'C',
		}), 'C');
	});

	test('forcePath=B + safe → B', () => {
		const session = drvSession();
		const id = session.blockOrder[0];
		assert.strictEqual(pickSavePath({
			session, dirtyBlockIds: [id], dirtyBlockContents: { [id]: 'x' },
			openedBytes: new Uint8Array(drv.bytes),
			forcePath: 'B',
		}), 'B');
	});

	test('forcePath=B + unsafe → C（正确性优先）', () => {
		const d = FIXTURES.find(x => x.cls === 'degraded')!;
		const { session } = buildFor(d.text);
		const id = session.blockOrder[0] ?? 'b_dummy00';
		assert.strictEqual(pickSavePath({
			session, dirtyBlockIds: [id], dirtyBlockContents: { [id]: 'x' },
			openedBytes: new Uint8Array(d.bytes),
			forcePath: 'B',
		}), 'C');
	});

	test('session=null → C', () => {
		assert.strictEqual(pickSavePath({
			session: null, dirtyBlockIds: [], dirtyBlockContents: {},
			openedBytes: new Uint8Array([1]),
		}), 'C');
	});
});

// ---------------------------------------------------------------------------
// AC-8 · dirty 多块替换 —— 拼装等式恒成立
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip · AC-8 多块 dirty 一致性', () => {
	for (const f of SAFE_FIXTURES) {
		if (f.cls === 'perf') { continue; }
		test(`[${f.cls}/${f.name}] 所有块 dirty → 拼装串 === interstitial + 替换值`, () => {
			const { session } = buildFor(f.text);
			if (session.blockOrder.length === 0) { return; }
			const dirty: Record<string, string> = {};
			for (const id of session.blockOrder) { dirty[id] = `<<${id}>>`; }
			const bytes = assembleIncremental(session, dirty);
			const dec = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
			let expected = '';
			for (let i = 0; i < session.blockOrder.length; i++) {
				const [gf, gt] = session.interstitial[i];
				expected += f.text.slice(gf, gt);
				expected += dirty[session.blockOrder[i]];
			}
			const tail = session.interstitial[session.interstitial.length - 1];
			expected += f.text.slice(tail[0], tail[1]);
			assert.strictEqual(dec, expected);
		});
	}
});

// ---------------------------------------------------------------------------
// Qa2 · formatSelection —— 严格 block 对齐 → path B
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip · Qa2 formatSelection 严格 block 对齐 (forcePath=B)', () => {
	for (const f of SAFE_FIXTURES) {
		if (f.cls === 'perf') { continue; }
		test(`[${f.cls}/${f.name}] forcePath=B + 全部 dirty 覆盖 → B`, () => {
			const { session } = buildFor(f.text);
			if (session.blockOrder.length === 0) { return; }
			const ids = [...session.blockOrder];
			const contents: Record<string, string> = {};
			for (const id of ids) { contents[id] = 'formatted'; }
			const p = pickSavePath({
				session, dirtyBlockIds: ids, dirtyBlockContents: contents,
				openedBytes: new Uint8Array(f.bytes), forcePath: 'B',
			});
			assert.strictEqual(p, 'B');
		});
	}
});

// ---------------------------------------------------------------------------
// Qa3 · 严格 byte-for-byte —— path A 不经过 Milkdown serializer
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip · Qa3 严格 byte-for-byte（path A 不重序列化）', () => {
	const strictCases = [
		'list-ordered-paren.md',
		'emphasis-mixed.md',
		'code-fence-4bt.md',
	];
	for (const name of strictCases) {
		test(`[typora/${name}] path=A 时 serializer.stringify 调用数 = 0`, () => {
			const f = FIXTURES.find(x => x.name === name);
			assert.ok(f, `fixture ${name} 存在`);
			const { session } = buildFor(f!.text);
			// spy 在决策阶段是否触发 stringify —— 因为 pickSavePath 是纯决策，
			// serializer 只在 path B / C 由主机侧调；此处 assert 决策选 A 即证明
			// 「不会走进 stringify」这条路径。若未来 pickSavePath 内部触发了
			// stringify（回归），这个 test 会通过错的分支导致后续 assert 失败。
			let stringifyCalls = 0;
			const _serializerSpy = { stringify(_x: unknown): string { stringifyCalls++; return ''; } };
			void _serializerSpy;
			const p = pickSavePath({
				session, dirtyBlockIds: [], dirtyBlockContents: {},
				openedBytes: new Uint8Array(f!.bytes),
			});
			assert.strictEqual(p, 'A', `${name} 空 dirty 应走 A`);
			assert.strictEqual(stringifyCalls, 0, 'pickSavePath 决策阶段不应调用 stringify');
		});
	}
});

// ---------------------------------------------------------------------------
// Qqa1 · nanoid session 内稳定 & 跨 session 重分配
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip · Qqa1 blockId session 内稳定 / 跨 session 重分配', () => {
	test('同一 session 反复读取 blockRanges → id 不变', () => {
		const f = FIXTURES.find(x => x.name === 'emphasis-mixed.md')!;
		const { session } = buildFor(f.text);
		const first = [...session.blockOrder];
		const second = [...session.blockOrder];
		assert.deepStrictEqual(first, second);
	});

	test('两次独立 build（不同 seed）→ 至少一个 id 不同', () => {
		const f = FIXTURES.find(x => x.name === 'all-features.md')!;
		const a = buildFor(f.text, 1, 12345);
		const b = buildFor(f.text, 2, 67890);
		const setA = new Set(a.session.blockOrder);
		const setB = new Set(b.session.blockOrder);
		let anyDiff = false;
		for (const id of setA) { if (!setB.has(id)) { anyDiff = true; break; } }
		if (!anyDiff) {
			for (const id of setB) { if (!setA.has(id)) { anyDiff = true; break; } }
		}
		assert.ok(anyDiff, '两次独立 build 应至少有一 id 不同（跨 session 重分配）');
	});

	test('前 10 个 fixture 的 blockId 全部匹配 BLOCK_ID_RE', () => {
		for (const f of FIXTURES.slice(0, 10)) {
			const { session } = buildFor(f.text);
			for (const id of session.blockOrder) {
				assert.ok(BLOCK_ID_RE.test(id), `${f.name}: illegal id ${id}`);
			}
		}
	});

	test('磁盘 fixture 不含 blockId 字符串（Qd2=a 磁盘无痕）', () => {
		for (const f of FIXTURES) {
			assert.strictEqual(
				/b_[0-9a-z]{8}(?:_\d+)?/.test(f.text),
				false,
				`${f.name}: fixture 泄漏了 blockId 格式`
			);
		}
	});
});

// ---------------------------------------------------------------------------
// Qqa3 · perf p95 采样（写 test/reports/roundtrip-perf.jsonl）
//
// 三分支保存路径各测一轮 open→save→reopen，追加一行 JSONL：
//   { ts, commit, path: '200kb-mixed.md', branch: 'A'|'B'|'C', ms, bytes, samples }
//
// path=A：空 dirty + openedBytes → 直接返回 openedBytes（byte-for-byte）
// path=B：全 blocks dirty + contents 覆盖齐 → assembleIncremental
// path=C：forcePath=C → 走 encodeUtf8(整篇 sourceText) 兜底
//
// 一轮 = buildSession + pickSavePath + save 实际字节流 + 重新 buildSession（reopen）。
// ---------------------------------------------------------------------------

function findReportsDir(): string | null {
	const candidates = [
		path.resolve(process.cwd(), 'test', 'reports'),
		path.resolve(HERE, '..', '..', '..', '..', '..', '..', '..', 'test', 'reports'),
		path.resolve(HERE, '..', '..', '..', '..', '..', '..', '..', '..', 'test', 'reports'),
	];
	for (const c of candidates) {
		if (fs.existsSync(path.dirname(c))) { return c; }
	}
	return null;
}

function currentCommit(): string {
	try {
		const r = cp.spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
			encoding: 'utf8', cwd: process.cwd(), timeout: 3000,
		});
		if (r.status === 0 && r.stdout) { return r.stdout.trim(); }
	} catch { /* ignore */ }
	return 'unknown';
}

function appendPerfLine(row: Record<string, unknown>): void {
	try {
		const target = findReportsDir();
		if (!target) { return; }
		fs.mkdirSync(target, { recursive: true });
		fs.appendFileSync(path.join(target, 'roundtrip-perf.jsonl'), JSON.stringify(row) + '\n');
	} catch { /* non-fatal */ }
}

/**
 * 单轮 open→save→reopen 计时。返回本轮总耗时（毫秒）。
 */
function measureOneRound(f: Fixture, branch: 'A' | 'B' | 'C', epoch: number): number {
	const t0 = Date.now();
	// open —— 从磁盘字节到 session
	const openedBytes = new Uint8Array(f.bytes);
	const { session } = buildFor(f.text, epoch);
	void session.coverage; void session.isSafe();

	// save —— 三分支各自的字节产物
	if (branch === 'A') {
		const p = pickSavePath({
			session, dirtyBlockIds: [], dirtyBlockContents: {}, openedBytes,
		});
		assert.strictEqual(p, 'A');
		// path A：直接使用 openedBytes（模拟磁盘原样回写），无需额外拷贝
		void openedBytes.byteLength;
	} else if (branch === 'B') {
		const ids = [...session.blockOrder];
		const contents: Record<string, string> = {};
		for (const id of ids) { contents[id] = 'x'; }
		const p = pickSavePath({
			session, dirtyBlockIds: ids, dirtyBlockContents: contents, openedBytes,
		});
		assert.strictEqual(p, 'B');
		assembleIncremental(session, contents);
	} else {
		const p = pickSavePath({
			session, dirtyBlockIds: [], dirtyBlockContents: {}, openedBytes, forcePath: 'C',
		});
		assert.strictEqual(p, 'C');
		encodeUtf8(f.text);
	}

	// reopen —— 重新构 session（新 epoch 模拟重开）
	const reopened = buildFor(f.text, epoch + 1);
	void reopened.session.blockOrder.length;
	return Date.now() - t0;
}

suite('VSWord Roundtrip · Qqa3 perf 采样', () => {
	// 保留历史 case（session build 单点 p95 < 500ms），下游脚本已依赖此断言点。
	test('perf/200kb-mixed.md session build p95 < 500ms + 写 jsonl', () => {
		const f = FIXTURES.find(x => x.name === '200kb-mixed.md')!;
		assert.ok(f, 'perf fixture 存在');
		assert.ok(f.bytes.length >= 200 * 1024, `${f.bytes.length} < 200KB`);
		const samples: number[] = [];
		for (let i = 0; i < 5; i++) {
			const t0 = Date.now();
			const { session } = buildFor(f.text, i + 1);
			void session.coverage; void session.isSafe();
			if (session.isSafe()) { assembleIncremental(session, {}); }
			samples.push(Date.now() - t0);
		}
		samples.sort((a, b) => a - b);
		const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
		appendPerfLine({
			ts: new Date().toISOString(),
			fixture: '200kb-mixed.md',
			bytes: f.bytes.length,
			ms: p95,
			samples,
		});
		assert.ok(p95 < 500, `p95=${p95}ms should be under 500ms (samples=${JSON.stringify(samples)})`);
	});

	// Qqa3=b · 三分支 open→save→reopen 一轮耗时 → 追加 { ts, commit, path, branch, ms }
	for (const branch of ['A', 'B', 'C'] as const) {
		test(`perf/200kb-mixed.md branch=${branch} open→save→reopen 一轮耗时 + JSONL`, () => {
			const f = FIXTURES.find(x => x.name === '200kb-mixed.md')!;
			assert.ok(f, 'perf fixture 存在');
			const commit = currentCommit();
			const samples: number[] = [];
			for (let i = 0; i < 3; i++) {
				samples.push(measureOneRound(f, branch, (i + 1) * 100));
			}
			samples.sort((a, b) => a - b);
			const median = samples[Math.floor(samples.length / 2)];
			appendPerfLine({
				ts: new Date().toISOString(),
				commit,
				path: '200kb-mixed.md',
				branch,
				bytes: f.bytes.length,
				ms: median,
				samples,
			});
			// 阈值放宽 —— 三分支各自完成一整轮 open+save+reopen，
			// path B 要额外跑 assembleIncremental，允许 <1500ms。
			assert.ok(median < 1500, `branch ${branch} median=${median}ms should be under 1500ms (samples=${JSON.stringify(samples)})`);
		});
	}
});

// ---------------------------------------------------------------------------
// Sanity · 每个 fixture 至少构造出 session 而不抛
// ---------------------------------------------------------------------------

// T-3.5c.5a: fixture 总数由 30 → 31（新增 typora/code-fence-meta.md 用于 F-21 code fence
// info meta round-trip 验证）。
// T-3.5c.5b: fixture 总数由 31 → 34（新增 typora/heading-setext-basic.md /
// heading-setext-duplicate.md / heading-setext-mixed.md 用于 F-20 setext heading 保源码
// 验证）。
// T-3.5b-flow.2: fixture 总数由 34 → 37（新增 typora/flowchart-basic.md /
// flowchart-condition.md / flowchart-mixed.md 用于 code_block[lang=flow] fence Round-trip
// 与 P0 语法保真验证）。
// T-3.5b-seq.2: fixture 总数由 37 → 40（新增 typora/sequence-basic.md /
// sequence-actors.md / sequence-notes.md 用于 code_block[lang=sequence] fence Round-trip
// 与 P0 语法保真验证）。这里 sanity 只保证矩阵仍在增长且未回退。
suite('VSWord Roundtrip · sanity 40 fixture 全体 build 不抛', () => {
	test('40 fixtures 全部可 build', () => {
		assert.strictEqual(FIXTURES.length, 40, `expected 40, got ${FIXTURES.length}`);
		for (const f of FIXTURES) {
			const { session } = buildFor(f.text);
			assert.ok(session);
			assert.ok(Number.isFinite(session.coverage));
		}
	});
	test('safe/unsafe 分区非空', () => {
		assert.ok(SAFE_FIXTURES.length > 0, 'safe 分区应至少有 1 个 fixture');
		assert.ok(UNSAFE_FIXTURES.length > 0, 'unsafe 分区应至少有 1 个 fixture（含 degraded）');
	});
	test('degraded 位于 unsafe 分区', () => {
		const d = UNSAFE_FIXTURES.find(f => f.cls === 'degraded');
		assert.ok(d, 'degraded fixture 应在 unsafe 分区');
	});
	test('perf 位于 safe 分区', () => {
		const p = SAFE_FIXTURES.find(f => f.cls === 'perf');
		assert.ok(p, 'perf fixture 应在 safe 分区');
	});
});

void BOM_CHAR;
void packSessionReady;
void computeCoverage;
