#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Gate G · Phase 3 stage gate（原 T-3.5c.6 · 模块 c 收官 gate 升级为 Phase 3 收官）
 *
 *  Gate G 由两组步骤合成：
 *
 *  A. 模块 c 语法补齐历史证据（T-3.5c.1..6，一键回归）
 *    1. build-milkdown-editor.cjs  —— webview bundle 构建 + verify.template.mjs 全量断言
 *       （含 T-3.5c.1..5 全部语法特性断言：emoji · footnote · frontmatter YAML/TOML/JSON ·
 *         sub/sup · code-block info meta · setext heading · 15 项 slash-menu + Syntax 组）
 *    2. gate-e.mjs                 —— round-trip 6 测试文件 + 34 fixture 覆盖矩阵
 *    3. gate-f.mjs                 —— mermaid 22 类 golden diff
 *    4. roundtrip-perf-baseline    —— A/B/C 三分支 p95 阈值
 *    5. roundtrip-selfcheck        —— 34 fixture × 3 遍 pickSavePath 稳定
 *    6. mermaid-selfcheck          —— 22 类 × 3 遍 normalized svg 字节一致
 *
 *  B. Phase 3.9 收官证据（T-3.9.4，见 PRD phase-3.9-perf-ime.md §4.6 / §8）
 *    7. phase-3.9-artifacts        —— 三份报告 + docs/decisions/phase-3-acceptance.md 存在，
 *                                     顶部含"验收结论"声明。**不重跑 perf/IME 手测**，只验证
 *                                     书面证据到位（perf breach 与 bundle 超阈值走 PRD §7 逃生
 *                                     路径 → phase-3-acceptance.md "未闭合项" 章节 → Phase 4）。
 *    8. ime-composition            —— run-ime-composition-test.mjs（3.9.2.c，9 case）
 *    9. tsc-baseline               —— code-oss/src tsc --noEmit 0 error（G-tsc）
 *
 *  产出：
 *    - test/reports/gate-g-<timestamp>.md   （汇总每一步 exit + 摘要）
 *    - --json                                （追加 JSON 摘要给 CI 消费）
 *
 *  任一子步骤非零退出 → Gate G 失败，exit 1。
 *
 *  用法（从仓库根跑）：
 *    node code-oss/test/scripts/gate-g.mjs                # 全量（A+B，模块 c 六步会跑 build，慢）
 *    node code-oss/test/scripts/gate-g.mjs --phase3-only  # 只跑 B 组三步（Phase 3 收官快速回归）
 *    node code-oss/test/scripts/gate-g.mjs --json
 *--------------------------------------------------------------------------------------------*/

import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const REPORTS_DIR = path.resolve(CODE_OSS, 'test', 'reports');

const argJson = process.argv.includes('--json');
const argPhase3Only = process.argv.includes('--phase3-only');
function log(msg) { if (!argJson) { process.stderr.write(msg + '\n'); } }

// Phase 3.9 收官所需的书面证据清单 —— phase3-artifacts 步骤只验证文件存在 + 首屏声明标记。
const PHASE3_ARTIFACTS = [
	{ path: 'code-oss/test/reports/phase-3.9-perf.md', mustContain: ['open', 'type'] },
	{ path: 'code-oss/test/reports/phase-3.9.2-ime-checklist.md', mustContain: [] },
	{ path: 'code-oss/test/reports/phase-3.9.3-comparison.md', mustContain: ['Phase 2', 'Phase 3'] },
	{ path: 'docs/decisions/phase-3-acceptance.md', mustContain: ['Gate D', 'Gate E', 'Gate F', 'Gate G'] },
];

function checkPhase3Artifacts() {
	const missing = [];
	const missingMarker = [];
	for (const item of PHASE3_ARTIFACTS) {
		const abs = path.resolve(REPO_ROOT, item.path);
		if (!fs.existsSync(abs)) { missing.push(item.path); continue; }
		const body = fs.readFileSync(abs, 'utf8');
		for (const marker of item.mustContain) {
			if (!body.includes(marker)) { missingMarker.push(`${item.path}: 缺 "${marker}"`); }
		}
	}
	return { missing, missingMarker };
}

// A. 模块 c 语法补齐历史 gate（六步 · 全量模式跑）
const STEPS_A = [
	{
		id: 'build',
		title: 'build-milkdown-editor.cjs（webview bundle + verify.template.mjs 全量断言）',
		file: path.join(CODE_OSS, 'src/vs/workbench/contrib/vsword/browser/milkdownEditor/build-milkdown-editor.cjs'),
		// T-3.5b-seq.2c: build.cjs 内部 `codeOssRoot = process.cwd()`，必须从 code-oss/ 目录跑，
		// 否则 workspaceRoot 计算错位、esbuild alias `empty-shim.js` 找不到。
		cwd: CODE_OSS,
		summarize(out) {
			try {
				// build script 最后一段 stdout 是 verify.template.mjs 的 JSON。
				const idx = out.lastIndexOf('{\n  "builtAt"');
				if (idx >= 0) {
					const parsed = JSON.parse(out.slice(idx));
					const rt = parsed.roundTrip;
					if (rt) {
						return `roundTrip.ok=${rt.ok}, failed=${(rt.failed || []).length}, bytes=${rt.outputBytes}, parserRoundTripBytes=${rt.parserRoundTripBytes}, bundle=${parsed.webviewBundleBytes}B`;
					}
				}
			} catch (_e) { /* fall through */ }
			return 'exit=0（详见构建 stdout）';
		},
	},
	{
		id: 'gate-e',
		title: 'gate-e.mjs（Round-trip Gate E · 6 测试文件 + 34 fixture）',
		file: path.join(HERE, 'gate-e.mjs'),
		args: ['--json'],
		summarize(out) {
			try {
				const idx = out.indexOf('{');
				if (idx >= 0) {
					const parsed = JSON.parse(out.slice(idx));
					const s = parsed.stats || {};
					return `tests=${s.tests}, passes=${s.passes}, failures=${s.failures}, pending=${s.pending}`;
				}
			} catch (_e) { /* ignore */ }
			return 'exit=0（详见 gate-e 报告）';
		},
	},
	{
		id: 'gate-f',
		title: 'gate-f.mjs（Mermaid Gate F · 22 类 golden diff）',
		file: path.join(HERE, 'gate-f.mjs'),
		args: ['--json'],
		summarize(out) {
			try {
				const idx = out.indexOf('{');
				if (idx >= 0) {
					const parsed = JSON.parse(out.slice(idx));
					const s = parsed.stats || {};
					return `tests=${s.tests}, passes=${s.passes}, failures=${s.failures}, pending=${s.pending}`;
				}
			} catch (_e) { /* ignore */ }
			return 'exit=0（详见 gate-f 报告）';
		},
	},
	{
		id: 'perf-baseline',
		title: 'roundtrip-perf-baseline.mjs（A/B/C 三分支 p95 ≤ 1500ms）',
		file: path.join(HERE, 'roundtrip-perf-baseline.mjs'),
		summarize(out) {
			// 抓 "所有分支 p95 均在阈值内" 那一行。
			const m = out.match(/所有分支 p95[^\n]*/);
			return m ? m[0].trim() : 'exit=0';
		},
	},
	{
		id: 'roundtrip-selfcheck',
		title: 'roundtrip-selfcheck.mjs（34 fixture × 3 遍 pickSavePath 稳定）',
		file: path.join(HERE, 'roundtrip-selfcheck.mjs'),
		summarize(out) {
			const m = out.match(/\[selfcheck\][^\n]*/g);
			return m ? m[m.length - 1].trim() : 'exit=0';
		},
	},
	{
		id: 'mermaid-selfcheck',
		title: 'mermaid-selfcheck.mjs（22 类 × 3 遍 normalized svg 字节一致）',
		file: path.join(HERE, 'mermaid-selfcheck.mjs'),
		summarize(out) {
			const m = out.match(/stable=\d+\/\d+[^\n]*/);
			return m ? m[0].trim() : 'exit=0';
		},
	},
];

// B. Phase 3.9 收官三步（--phase3-only 时只跑这三步，全量模式追加在 A 之后）
const STEPS_B = [
	{
		id: 'phase3-artifacts',
		title: 'Phase 3.9 书面证据 · 三报告 + phase-3-acceptance.md 存在且含 Gate 声明',
		inline: () => {
			const { missing, missingMarker } = checkPhase3Artifacts();
			if (missing.length || missingMarker.length) {
				return {
					exitCode: 1,
					stdout: JSON.stringify({ missing, missingMarker }, null, 2),
					stderr: '',
					summary: `missing=${missing.length} missingMarker=${missingMarker.length}`,
				};
			}
			return {
				exitCode: 0,
				stdout: `artifacts ok · ${PHASE3_ARTIFACTS.length} 份`,
				stderr: '',
				summary: `${PHASE3_ARTIFACTS.length} 份证据齐 · Gate D/E/F/G 声明命中`,
			};
		},
	},
	{
		id: 'ime-composition',
		title: 'run-ime-composition-test.mjs（3.9.2.c · IME state machine · 9 case · jsdom mocha）',
		file: path.join(HERE, 'run-ime-composition-test.mjs'),
		summarize(out) {
			const m = out.match(/(\d+)\s+passing/);
			return m ? `${m[1]} passing` : 'exit=0';
		},
	},
	{
		id: 'tsc-baseline',
		title: 'code-oss/src tsc --noEmit（G-tsc · 0 error 基线）',
		file: path.resolve(CODE_OSS, 'node_modules/typescript/bin/tsc'),
		args: ['--noEmit', '-p', 'src/tsconfig.json'],
		cwd: CODE_OSS,
		env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' },
		summarize(out) {
			// tsc 静默 = 0 error；错误行形如 "error TSxxxx:"
			const errCount = (out.match(/error TS\d+/g) || []).length;
			return errCount === 0 ? '0 error' : `${errCount} error`;
		},
	},
];

// 根据模式合成 STEPS。--phase3-only 只跑 B 组三步（快速回归，用户 push 前手动跑）。
const STEPS = argPhase3Only ? STEPS_B : [...STEPS_A, ...STEPS_B];

function runStep(step) {
	log(`[gate-g] ▶ ${step.id} · ${step.title}`);
	const t0 = Date.now();

	// inline 步骤：函数直接返回 { exitCode, stdout, stderr, summary }，不 spawn 子进程。
	if (typeof step.inline === 'function') {
		let res;
		try { res = step.inline(); }
		catch (e) { res = { exitCode: 1, stdout: '', stderr: String(e && e.stack || e), summary: `inline throw: ${e && e.message || e}` }; }
		const elapsed = Date.now() - t0;
		log(`[gate-g] ${res.exitCode === 0 ? '✓' : '✗'} ${step.id} · ${elapsed} ms · ${res.summary}`);
		return { id: step.id, title: step.title, exitCode: res.exitCode, elapsed, summary: res.summary, stdout: res.stdout, stderr: res.stderr };
	}

	const args = [step.file, ...(step.args || [])];
	const res = cp.spawnSync(process.execPath, args, {
		encoding: 'utf8',
		cwd: step.cwd || REPO_ROOT,
		env: step.env || process.env,
		maxBuffer: 32 * 1024 * 1024,
	});
	const elapsed = Date.now() - t0;
	const stdout = res.stdout || '';
	const stderr = res.stderr || '';
	const exitCode = res.status ?? 0;
	const combined = stdout + (stderr ? '\n' + stderr : '');
	const summary = (() => {
		try { return step.summarize(combined); } catch { return `exit=${exitCode}`; }
	})();
	log(`[gate-g] ${exitCode === 0 ? '✓' : '✗'} ${step.id} · ${elapsed} ms · ${summary}`);
	return { id: step.id, title: step.title, exitCode, elapsed, summary, stdout, stderr };
}

function buildMdReport(steps, totalElapsed, exitCode) {
	const now = new Date();
	const lines = [];
	lines.push(`# Gate G · Phase 3 stage gate · ${now.toISOString()}${argPhase3Only ? ' · --phase3-only' : ''}`);
	lines.push('');
	lines.push(`- exitCode: ${exitCode}`);
	lines.push(`- 总用时: ${totalElapsed} ms`);
	lines.push(`- 子步骤数: ${steps.length}`);
	lines.push(`- 通过: ${steps.filter(s => s.exitCode === 0).length}`);
	lines.push(`- 失败: ${steps.filter(s => s.exitCode !== 0).length}`);
	lines.push('');
	lines.push('## 子步骤汇总');
	lines.push('');
	lines.push('| # | 步骤 | 状态 | 用时(ms) | 摘要 |');
	lines.push('|---|---|:-:|---:|---|');
	steps.forEach((s, i) => {
		lines.push(`| ${i + 1} | ${s.title} | ${s.exitCode === 0 ? '✅' : '❌'} | ${s.elapsed} | ${s.summary.replace(/\|/g, '\\|')} |`);
	});
	lines.push('');
	lines.push('## 覆盖清单（T-3.5c.1..5 语法特性 → build-milkdown-editor verify 断言）');
	lines.push('');
	lines.push('| 特性 (task) | verify.template.mjs 断言 key |');
	lines.push('|---|---|');
	lines.push('| emoji (T-3.5c.1) | emojiRoundTripKeepsSmile · emojiRoundTripKeepsHeart · emojiRoundTripKeepsUnknown · emojiOutputHasNoUnicodeSmile · parseEmoji*(4) · resolveEmoji*(3) · stringifyEmoji*(3) · EMOJI_RE*(3) · extractShortcodeName*(2) |');
	lines.push('| footnote (T-3.5c.2) | footnoteRefRoundTripDigit · footnoteRefRoundTripNamed · footnoteRefRoundTripCjk · footnoteDef*(3) · footnoteOutputHasNoSupTag · footnoteOutputHasNoDlTag · helpers · HoverIntent 状态机 |');
	lines.push('| frontmatter YAML/TOML/JSON (T-3.5c.3) | frontmatterRoundTripAllFixtures · yaml-basic/quoted/indent/empty/syntax-err · toml-basic · json-legacy · trailing-nl（8 fixture）· helpers · FRONTMATTER_PARSERS |');
	lines.push('| sub/sup (T-3.5c.4) | roundTripHasSubscriptH2O · roundTripHasSubscriptCO2 · roundTripHasSuperscriptX2 · roundTripHasSuperscriptEn · subSupNoStrikeCollision |');
	lines.push('| code-block info meta (T-3.5c.5a) | codeBlockMetaJsPreserved · codeBlockMetaTsPreserved · codeBlockMetaBodyPreserved · codeBlockMermaidWhitelistedNoMeta · codeBlockPythonHasNoMeta |');
	lines.push('| setext heading (T-3.5c.5b) | 未主动改写：由 gate-e 的 AC-1 pandoc/heading-setext.md + typora/heading-setext-*.md fixture 覆盖（4 类 setext fixture in fixtures/roundtrip） |');
	lines.push('| slash-menu 15 项 + Syntax 组 (T-3.5c.6 F-24) | slashHasFifteenItems · slashGroupsCorrect · slashHasEmojiEntry · slashHasFootnoteEntry · slashHasFrontmatterEntry |');
	lines.push('');
	lines.push('> 备注：build-milkdown-editor.cjs 每次 build 都会跑 verify.template.mjs 全量断言，任一 fail 直接 exit 1。');
	lines.push('');
	lines.push('## F-23 Definition list（Could · P2 · 已识别但不做 NodeView）');
	lines.push('');
	lines.push('`code-oss/src/vs/workbench/contrib/vsword/test/fixtures/roundtrip/pandoc/def-list.md` 参与 gate-e AC-1/AC-2/AC-3/AC-8 全通道 fixture 组，remark-parse 把 `term\\n:  def` 结构识别成普通段落，round-trip byte-for-byte 保源码；无独立 NodeView 交互（PRD Could P2，本轮兜底"识别不改写"策略）。');
	lines.push('');
	return lines.join('\n') + '\n';
}

function main() {
	fs.mkdirSync(REPORTS_DIR, { recursive: true });
	const t0 = Date.now();
	const results = [];
	for (const step of STEPS) {
		const r = runStep(step);
		results.push(r);
		if (r.exitCode !== 0 && !argJson) {
			// 早退：继续跑其他步骤没意义（build 挂了后面的都会挂）。
			// 但仍生成报告，方便定位。
			break;
		}
	}
	const totalElapsed = Date.now() - t0;
	const exitCode = results.every(r => r.exitCode === 0) && results.length === STEPS.length ? 0 : 1;

	const reportPath = path.join(REPORTS_DIR, `gate-g-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
	fs.writeFileSync(reportPath, buildMdReport(results, totalElapsed, exitCode), 'utf8');
	log(`[gate-g] 报告 -> ${reportPath}`);
	log(`[gate-g] exitCode=${exitCode} totalElapsed=${totalElapsed}ms`);

	if (argJson) {
		process.stdout.write(JSON.stringify({
			exitCode,
			totalElapsed,
			report: reportPath,
			steps: results.map(({ id, title, exitCode, elapsed, summary }) => ({ id, title, exitCode, elapsed, summary })),
		}, null, 2) + '\n');
	}
	process.exit(exitCode);
}

main();
