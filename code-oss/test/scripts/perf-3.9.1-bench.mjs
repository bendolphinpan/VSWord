#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.9.1.b · 大文档 open + type 性能基线 bench
 *
 *  度量口径（严格按 PRD phase-3.9-perf-ime.md §4.2）：
 *
 *    - **open**：读盘 → remark-parse → buildSessionFromMdast → assembleIncremental。
 *      这条链路等价于生产上「EditorInput.resolve() → webview postMessage(ready) → host ack」
 *      在关键路径上的 CPU 部分（parser + session build 是唯一的 O(N) 计算，剩余是消息传输）。
 *      不在 jsdom 里跑 Milkdown 全家桶，是因为 Gate E baseline 里已经验证过 200KB fixture
 *      三分支 p95 < 10ms，加上 Milkdown editor mount 时间是相对稳定的常数项（<50ms）——把
 *      变量隔离到「随 fixture 字节数扩大而线性变化」的部分，signal 更干净。
 *
 *    - **type**：用 prosemirror-state/model 构造一份和 fixture 同规模的 doc
 *      （把源码按段拆成 paragraph node），dispatch 200 次 tr.insertText，用 performance.now()
 *      逐次测 state.apply(tr) 耗时。等价 webview keydown → ProseMirror docChanged transaction。
 *      不测 render/paint（那属于 Milkdown NodeView + DOM 层，不在 3.9.1 scope 内）。
 *
 *  用法（从仓库根跑）：
 *    node code-oss/test/scripts/perf-3.9.1-bench.mjs --fixture 1mb --runs 5
 *    node code-oss/test/scripts/perf-3.9.1-bench.mjs --fixture 5mb --runs 5
 *    node code-oss/test/scripts/perf-3.9.1-bench.mjs --help
 *
 *  产出：
 *    - 追加 JSONL 到 code-oss/test/reports/perf-3.9.1.jsonl，每次运行 2 行（open + type）：
 *        { ts, commit, fixture, phase: 'open'|'type', ms, samples, p95, p50 }
 *    - stdout 打印本次 runs 的 P95/P50
 *    - exit code：所有阈值过 → 0；任一超阈值 → 1（供 CI 消费）
 *
 *  阈值（PRD §4.2）：
 *    - 1mb / 5mb open p95 ≤ 2000ms
 *    - 1mb / 5mb type p95 ≤ 50ms
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const BUILDER = path.resolve(REPO_ROOT, '.tmp', 'milkdown-prod-builder');
const BUILDER_NODE_MODULES = path.join(BUILDER, 'node_modules');
const REPORTS_DIR = path.resolve(CODE_OSS, 'test', 'reports');
const FIXTURE_DIR = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/test/fixtures/roundtrip/perf');

const HELP = `Usage:
  node code-oss/test/scripts/perf-3.9.1-bench.mjs --fixture <1mb|5mb> [--runs 5]

Options:
  --fixture <1mb|5mb>   目标 fixture 文件（必填）
  --runs <N>            运行轮次（默认 5）
  --keystrokes <N>      每轮 type 阶段的按键次数（默认 200，PRD §4.2）
  --skip-open           只跑 type 阶段
  --skip-type           只跑 open 阶段
  --help                打印本帮助

Notes:
  - 需要 fixture 已生成：先跑 gen-perf-fixture.mjs 产出 1mb-mixed.md / 5mb-mixed.md
  - 需要 .tmp/milkdown-prod-builder/node_modules 已装（Gate E prod build 会装）
  - JSONL 追加到 code-oss/test/reports/perf-3.9.1.jsonl
  - 阈值：1mb/5mb open p95 ≤ 2000ms, type p95 ≤ 50ms（PRD §4.2）
`;

function parseArgs(argv) {
	const args = {
		fixture: null, runs: 5, keystrokes: 200,
		skipOpen: false, skipType: false, help: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--help' || a === '-h') { args.help = true; }
		else if (a === '--fixture') { args.fixture = argv[++i]; }
		else if (a === '--runs') { args.runs = parseInt(argv[++i], 10); }
		else if (a === '--keystrokes') { args.keystrokes = parseInt(argv[++i], 10); }
		else if (a === '--skip-open') { args.skipOpen = true; }
		else if (a === '--skip-type') { args.skipType = true; }
		else { throw new Error(`未知参数：${a}\n${HELP}`); }
	}
	return args;
}

function currentCommit() {
	try {
		const r = cp.spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
			encoding: 'utf8', cwd: REPO_ROOT, timeout: 3000,
		});
		if (r.status === 0 && r.stdout) { return r.stdout.trim(); }
	} catch { /* ignore */ }
	return 'unknown';
}

function percentile(sorted, q) {
	if (sorted.length === 0) { return 0; }
	if (sorted.length === 1) { return sorted[0]; }
	const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
	return sorted[idx];
}

/**
 * 从 builder node_modules 加载 ESM 包（用 pathToFileURL 绕开 require paths 限制）。
 */
async function loadFromBuilder(pkgPath) {
	const abs = path.join(BUILDER_NODE_MODULES, pkgPath);
	if (!fs.existsSync(abs)) {
		throw new Error(`builder module 缺失：${abs}\n请先跑一次 vsword prod build`);
	}
	return await import(pathToFileURL(abs).href);
}

/**
 * 加载 remark（+ frontmatter/gfm/math 扩展，对齐生产 parser hook 用的语法集合）。
 */
async function loadRemark() {
	const remarkMod = await loadFromBuilder('remark/index.js');
	const gfmMod = await loadFromBuilder('remark-gfm/index.js');
	const frontMod = await loadFromBuilder('remark-frontmatter/index.js');
	const mathMod = await loadFromBuilder('remark-math/index.js');
	const remark = remarkMod.remark;
	const remarkGfm = gfmMod.default;
	const remarkFrontmatter = frontMod.default;
	const remarkMath = mathMod.default;
	return remark().use(remarkFrontmatter, ['yaml', 'toml']).use(remarkGfm).use(remarkMath);
}

/**
 * 加载 session/serializer/allocator + parser hook。
 * roundtrip/*.ts 是 TS 源码 —— 生产走 tsc 编译；bench 侧用 builder 里的 esbuild
 * bundle 成一个 mjs（含 setext-helpers 依赖），再动态 import。
 * 参照 gate-e.mjs 的 buildBundle 做法（同样是从 test/scripts/ 里跑 vsword TS）。
 */
async function loadRoundtripSuite() {
	const esbuildPkg = path.join(BUILDER_NODE_MODULES, 'esbuild');
	if (!fs.existsSync(esbuildPkg)) {
		throw new Error(`esbuild not found at ${esbuildPkg}. Run vsword prod build first.`);
	}
	const esbuildMain = pathToFileURL(path.join(esbuildPkg, 'lib', 'main.js')).href;
	const esbuildMod = await import(esbuildMain);
	const esbuild = esbuildMod.default || esbuildMod;

	const outdir = fs.mkdtempSync(path.join(CODE_OSS, '.tmp-perf-3.9.1-'));
	const barrel = path.join(outdir, 'barrel.mjs');
	const rtBase = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/browser/milkdownEditor/roundtrip');
	const wvBase = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview');
	const posix = p => p.replace(/\\/g, '/');
	fs.writeFileSync(barrel, [
		`export * as session from ${JSON.stringify(posix(path.join(rtBase, 'roundtripSession.ts')))};`,
		`export * as serializer from ${JSON.stringify(posix(path.join(rtBase, 'roundtripSerializer.ts')))};`,
		`export * as alloc from ${JSON.stringify(posix(path.join(rtBase, 'blockIdAllocator.ts')))};`,
		`export * as hook from ${JSON.stringify(posix(path.join(wvBase, 'roundtrip-parser-hook.template.js')))};`,
	].join('\n'));
	const outfile = path.join(outdir, 'roundtrip-suite.mjs');
	await esbuild.build({
		entryPoints: [barrel],
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node20',
		outfile,
		loader: { '.ts': 'ts' },
		// hook 里 import 的相对 .mjs 需要能被解析成 .template.js（gate-e 做法）
		plugins: [{
			name: 'perf-3.9.1-alias',
			setup(build) {
				build.onResolve({ filter: /\.mjs$/ }, args => {
					if (!args.path.startsWith('./')) { return null; }
					const base = args.path.slice(2, -'.mjs'.length);
					const candidate = path.join(args.resolveDir, base + '.template.js');
					if (fs.existsSync(candidate)) { return { path: candidate }; }
					return null;
				});
			},
		}],
		external: ['node:*', 'fs', 'path', 'os', 'url', 'assert'],
		logLevel: 'error',
	});
	const suite = await import(pathToFileURL(outfile).href);
	// 顺手清理 outdir（下次跑不留 tmp）——但延迟到进程 exit 后清理，避免 esm 缓存悬挂
	process.on('exit', () => {
		try { fs.rmSync(outdir, { recursive: true, force: true }); } catch { /* ignore */ }
	});
	return {
		createRoundtripSession: suite.session.createRoundtripSession,
		pickSavePath: suite.serializer.pickSavePath,
		assembleIncremental: suite.serializer.assembleIncremental,
		encodeUtf8: suite.serializer.encodeUtf8,
		BlockIdAllocator: suite.alloc.BlockIdAllocator,
		buildSessionFromMdast: suite.hook.buildSessionFromMdast,
	};
}

/**
 * 加载 prosemirror-state/model —— 用于 type 阶段的 transaction dispatch。
 */
async function loadProsemirror() {
	const model = await loadFromBuilder('prosemirror-model/dist/index.js');
	const state = await loadFromBuilder('prosemirror-state/dist/index.js');
	return { model, state };
}

/**
 * 构造一份和 fixture 规模相当的 ProseMirror doc：按空行分段，每段一个 paragraph。
 * 目的：让 doc 的节点数、总文本长度贴近真实场景，避免用空 doc 跑 type 测出 O(1) 噪声。
 *
 * 段落里的所有内联标记（`code` / **bold** / [link]）都当纯文本处理 —— 生产的
 * ProseMirror doc 也是「按 mark 切 text run」，但 keystroke 只影响光标点的单个 text run，
 * 整体 tr.apply 的复杂度与「doc 总节点数」正相关，与 mark 细分正交。
 */
function buildDocFromSource(sourceText, schema) {
	const paras = sourceText.split(/\n{2,}/);
	const nodes = [];
	for (const raw of paras) {
		const trimmed = raw.replace(/\r/g, '').trim();
		if (!trimmed) { continue; }
		// paragraph 只接受 inline content；把源码文本原样塞入
		// （包括表格行/代码块字面量），拿到与源规模一致的节点/文本总量
		nodes.push(schema.nodes.paragraph.create(null, schema.text(trimmed)));
	}
	if (nodes.length === 0) {
		nodes.push(schema.nodes.paragraph.create());
	}
	return schema.nodes.doc.create(null, nodes);
}

// ────────────────────────────────────────────────────────────────
// open 阶段
// ────────────────────────────────────────────────────────────────

/**
 * 一次 open：读盘 → remark-parse → session build → 一次 A 分支 pickSavePath +
 *  空 dirty assembleIncremental（等价 host 收到 sessionReady 后立刻验证一次 safety）。
 *
 * 返回本轮总耗时（毫秒，performance.now() 高精度）。
 */
function measureOneOpen({
	fixturePath, remarkProcessor, suite,
}) {
	const t0 = performance.now();
	const text = fs.readFileSync(fixturePath, 'utf8');
	const bytes = Buffer.byteLength(text, 'utf8');
	const tree = remarkProcessor.parse(text);
	const allocator = new suite.BlockIdAllocator();
	const raw = suite.buildSessionFromMdast(tree, text, 1, allocator);
	const session = suite.createRoundtripSession({
		epoch: 1,
		sourceText: text,
		blockOrder: raw.blockOrder,
		blockRanges: raw.blockRanges,
		interstitial: raw.interstitial,
	});
	// 触发 lazy coverage / safety 计算 —— 生产 host 在 sessionReady 后就会读这两项
	void session.coverage; void session.isSafe();
	// path A 兜底一次（等价 host ack 之前的一次冷 assemble 尝试）
	if (session.isSafe()) {
		suite.assembleIncremental(session, {});
	}
	const ms = performance.now() - t0;
	return { ms, bytes };
}

// ────────────────────────────────────────────────────────────────
// type 阶段
// ────────────────────────────────────────────────────────────────

/**
 * 200 次 keystroke，逐次 dispatch tr.insertText 到 doc 末尾。
 * 每一次都测 state.apply(tr) 单独耗时，取 P95 作为「单次按键落屏」指标。
 *
 * corpus：中英文混合的 100 字符池，模拟真实写作输入（不用重复单字符 —— 那会
 * 落到 text-run 合并 fast path，测不出真实 tr 开销）。
 */
const KEYSTROKE_CORPUS = (
	'的是你我他中文段落写作场景常见 ' +
	'The quick brown fox jumps over the lazy dog ' +
	'时间到了，来一句「测试」输入; ' +
	'abc123 !@# $%^ &*() 中英混合'
);

function measureType({
	sourceText, keystrokes, prosemirror,
}) {
	const { model, state } = prosemirror;
	// 只用最小 schema：doc + paragraph + text —— 与 Milkdown 里的 paragraph 节点等价，
	// 也避免引入 preset-commonmark 的 schema 依赖链。
	const schema = new model.Schema({
		nodes: {
			doc: { content: 'block+' },
			paragraph: {
				content: 'inline*',
				group: 'block',
				parseDOM: [{ tag: 'p' }],
				toDOM() { return ['p', 0]; },
			},
			text: { group: 'inline' },
		},
	});
	const doc = buildDocFromSource(sourceText, schema);
	let s = state.EditorState.create({ schema, doc });

	// 光标定位到 doc 末尾（末段 paragraph 内的 text end）
	const endPos = s.doc.content.size - 1;
	s = s.apply(s.tr.setSelection(state.TextSelection.create(s.doc, endPos)));

	const samples = new Array(keystrokes);
	for (let i = 0; i < keystrokes; i++) {
		const ch = KEYSTROKE_CORPUS[i % KEYSTROKE_CORPUS.length];
		const from = s.selection.from;
		const tr = s.tr.insertText(ch, from, from);
		const t0 = performance.now();
		s = s.apply(tr);
		samples[i] = performance.now() - t0;
	}
	// 触发一次 doc.textContent 读取 —— 生产的 docChanged listener 至少会读一次
	// 是否为空文档（vsword auto-save gate），避免 apply 后延迟计算被吃掉
	void s.doc.textContent.length;
	return samples;
}

// ────────────────────────────────────────────────────────────────
// 主流程
// ────────────────────────────────────────────────────────────────

const THRESHOLDS = {
	'1mb': { open: 2000, type: 50 },
	'5mb': { open: 2000, type: 50 },
};

function statsFor(samples) {
	const sorted = samples.slice().sort((a, b) => a - b);
	return {
		p50: +percentile(sorted, 0.5).toFixed(2),
		p95: +percentile(sorted, 0.95).toFixed(2),
		max: +sorted[sorted.length - 1].toFixed(2),
		min: +sorted[0].toFixed(2),
		mean: +(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2),
	};
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) { process.stdout.write(HELP); process.exit(0); }
	if (!args.fixture) { process.stderr.write('缺少 --fixture 参数\n' + HELP); process.exit(2); }
	if (!['1mb', '5mb'].includes(args.fixture.toLowerCase())) {
		process.stderr.write(`--fixture 必须是 1mb 或 5mb（当前：${args.fixture}）\n`); process.exit(2);
	}
	const fixtureKey = args.fixture.toLowerCase();
	const fixturePath = path.join(FIXTURE_DIR, `${fixtureKey}-mixed.md`);
	if (!fs.existsSync(fixturePath)) {
		process.stderr.write(
			`fixture 不存在：${fixturePath}\n` +
			`请先跑：node code-oss/test/scripts/gen-perf-fixture.mjs --size ${fixtureKey.toUpperCase()}\n`
		);
		process.exit(2);
	}

	process.stdout.write(`[perf-3.9.1] fixture=${fixtureKey} runs=${args.runs} keystrokes=${args.keystrokes}\n`);
	process.stdout.write(`[perf-3.9.1] loading builder deps...\n`);

	const remarkProcessor = await loadRemark();
	const suite = await loadRoundtripSuite();
	const prosemirror = await loadProsemirror();

	const commit = currentCommit();
	const ts = new Date().toISOString();
	fs.mkdirSync(REPORTS_DIR, { recursive: true });
	const jsonlPath = path.join(REPORTS_DIR, 'perf-3.9.1.jsonl');

	const results = { open: null, type: null, bytes: null };

	// ── open ───────────────────────────────────────────────────
	if (!args.skipOpen) {
		process.stdout.write(`[perf-3.9.1] ▶ open × ${args.runs}\n`);
		const openSamples = [];
		let bytes = 0;
		for (let i = 0; i < args.runs; i++) {
			const r = measureOneOpen({ fixturePath, remarkProcessor, suite });
			openSamples.push(+r.ms.toFixed(2));
			bytes = r.bytes;
			process.stdout.write(`  run ${i + 1}: ${r.ms.toFixed(2)} ms\n`);
		}
		const openStats = statsFor(openSamples);
		results.open = { samples: openSamples, ...openStats };
		results.bytes = bytes;
		const row = {
			ts, commit, fixture: `${fixtureKey}-mixed.md`,
			phase: 'open', ms: openStats.p95, samples: openSamples,
			p95: openStats.p95, p50: openStats.p50, bytes,
		};
		fs.appendFileSync(jsonlPath, JSON.stringify(row) + '\n');
		process.stdout.write(`  → p50=${openStats.p50}ms p95=${openStats.p95}ms max=${openStats.max}ms bytes=${bytes}\n`);
	}

	// ── type ───────────────────────────────────────────────────
	if (!args.skipType) {
		process.stdout.write(`[perf-3.9.1] ▶ type × ${args.runs} (${args.keystrokes} keystrokes each)\n`);
		// 一次读盘就够，type 不重复读磁盘（PRD 度量的是 keydown→docChanged，不含磁盘）
		const sourceText = fs.readFileSync(fixturePath, 'utf8');
		const typeP95Per = [];
		let allSamples = [];
		for (let i = 0; i < args.runs; i++) {
			const s = measureType({ sourceText, keystrokes: args.keystrokes, prosemirror });
			const st = statsFor(s);
			typeP95Per.push(st.p95);
			allSamples = allSamples.concat(s);
			process.stdout.write(`  run ${i + 1}: p50=${st.p50}ms p95=${st.p95}ms max=${st.max}ms (n=${s.length})\n`);
		}
		// 汇总口径：把 runs*keystrokes 全部拉平算 p95，signal 更稳
		const typeStatsFlat = statsFor(allSamples);
		results.type = { samplesFlat: typeP95Per, ...typeStatsFlat };
		const row = {
			ts, commit, fixture: `${fixtureKey}-mixed.md`,
			phase: 'type', ms: typeStatsFlat.p95, samples: typeP95Per,
			p95: typeStatsFlat.p95, p50: typeStatsFlat.p50,
			keystrokes: args.keystrokes, totalKeystrokes: allSamples.length,
		};
		fs.appendFileSync(jsonlPath, JSON.stringify(row) + '\n');
		process.stdout.write(`  → flat p50=${typeStatsFlat.p50}ms p95=${typeStatsFlat.p95}ms max=${typeStatsFlat.max}ms (n=${allSamples.length})\n`);
	}

	// ── 阈值判定 ────────────────────────────────────────────────
	const thresh = THRESHOLDS[fixtureKey];
	const violations = [];
	if (results.open && results.open.p95 > thresh.open) {
		violations.push(`open p95 ${results.open.p95}ms > ${thresh.open}ms`);
	}
	if (results.type && results.type.p95 > thresh.type) {
		violations.push(`type p95 ${results.type.p95}ms > ${thresh.type}ms`);
	}

	process.stdout.write(`\n[perf-3.9.1] JSONL → ${jsonlPath}\n`);
	if (violations.length > 0) {
		process.stdout.write(`[perf-3.9.1] 🔴 THRESHOLD BREACH:\n`);
		for (const v of violations) { process.stdout.write(`  - ${v}\n`); }
		process.exit(1);
	}
	process.stdout.write(`[perf-3.9.1] ✓ 所有阈值均在范围内\n`);
	process.exit(0);
}

main().catch(err => {
	process.stderr.write(`[perf-3.9.1] fatal: ${err && err.stack || err}\n`);
	process.exit(2);
});
