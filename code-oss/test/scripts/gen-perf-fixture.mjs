#!/usr/bin/env node
// T-3.9.1.a · 大文档 fixture 生成器
//
// 用法：
//   node code-oss/test/scripts/gen-perf-fixture.mjs --size 1MB
//   node code-oss/test/scripts/gen-perf-fixture.mjs --size 5MB
//   node code-oss/test/scripts/gen-perf-fixture.mjs --help
//
// 产出（相对仓库根）：
//   code-oss/src/vs/workbench/contrib/vsword/test/fixtures/roundtrip/perf/1mb-mixed.md
//   code-oss/src/vs/workbench/contrib/vsword/test/fixtures/roundtrip/perf/5mb-mixed.md
//
// 关键约束（PRD phase-3.9-perf-ime.md §4.1）：
// - 目标字节 ±5%
// - 确定性：seed=42（LCG），同命令跑两次 md5 完全一致
// - 配比 60% 中文段 / 20% 代码块 / 10% 表格 / 5% 图片 / 5% 数学公式
// - fixture 本体不 commit（走 gitignore），只提交本脚本

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ────────────────────────────────────────────────────────────────
// CLI 解析
// ────────────────────────────────────────────────────────────────
const HELP = `Usage:
  node code-oss/test/scripts/gen-perf-fixture.mjs --size <1MB|5MB> [--out <path>]

Options:
  --size <1MB|5MB>    目标文件大小（必填）
  --out  <path>       输出路径（默认按 size 落到 fixtures/roundtrip/perf/<size>-mixed.md）
  --help              打印本帮助

Notes:
  - seed 固定为 42，同一 --size 跑两次字节完全一致（md5 一致）
  - 内容配比：60% 中文段 / 20% 代码块 / 10% 表格 / 5% 图片 / 5% 数学
  - PRD: docs/requirements/phase-3.9-perf-ime.md §4.1（T-3.9.1.a）
`;

function parseArgs(argv) {
	const args = { size: null, out: null, help: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--help' || a === '-h') { args.help = true; }
		else if (a === '--size') { args.size = argv[++i]; }
		else if (a === '--out') { args.out = argv[++i]; }
		else { throw new Error(`未知参数：${a}\n${HELP}`); }
	}
	return args;
}

function parseSize(spec) {
	// 支持 1MB / 5MB（大小写不敏感，允许省略 B）
	if (!spec) { throw new Error('缺少 --size 参数\n' + HELP); }
	const m = /^(\d+(?:\.\d+)?)\s*(KB|MB|B)?$/i.exec(spec.trim());
	if (!m) { throw new Error(`--size 格式非法：${spec}（示例：1MB / 5MB）`); }
	const n = parseFloat(m[1]);
	const unit = (m[2] || 'B').toUpperCase();
	const mul = unit === 'MB' ? 1_000_000 : unit === 'KB' ? 1_000 : 1;
	return Math.round(n * mul);
}

// ────────────────────────────────────────────────────────────────
// LCG 随机（seed=42）—— Numerical Recipes 常数，周期 2^32
// ────────────────────────────────────────────────────────────────
function createRng(seed) {
	let s = seed >>> 0;
	return {
		next() {
			s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
			return s / 0x100000000;
		},
		int(min, maxExclusive) {
			return min + Math.floor(this.next() * (maxExclusive - min));
		},
		pick(arr) { return arr[Math.floor(this.next() * arr.length)]; },
		/** Fisher-Yates 打乱（不修改原数组） */
		shuffle(arr) {
			const a = arr.slice();
			for (let i = a.length - 1; i > 0; i--) {
				const j = Math.floor(this.next() * (i + 1));
				[a[i], a[j]] = [a[j], a[i]];
			}
			return a;
		},
	};
}

// ────────────────────────────────────────────────────────────────
// 中文 corpus —— 覆盖散文 / 技术叙述 / 短句，共 30 条
// 生成器每次从这里挑 2~4 句拼段落
// ────────────────────────────────────────────────────────────────
const CN_SENTENCES = [
	'编辑器在处理大文档时的首要目标是保持交互的流畅，而不是一次性把全部内容渲染到屏幕。',
	'性能基线的意义在于，我们能明确地知道下一次改动是让编辑器变快了，还是变慢了。',
	'输入法组合事件（composition）在中文场景里天然穿插在每一次按键之间，任何 auto-save 都必须避开这段窗口。',
	'我们通过 fixture 复现出真实文档的复杂度，包括段落、代码、表格、图片、公式混排。',
	'当文档规模到达一兆字节以上时，序列化 / 反序列化的常量因子开始明显主导端到端耗时。',
	'ProseMirror 的事务模型保证了每一次 doc 变化都是原子的，测试的关键是围绕 transaction 边界断言。',
	'键入落屏 P95 通常比平均值更能反映用户可感知的卡顿——因为长尾才是投诉来源。',
	'性能报告一定要可复现：同一个 commit、同一台机器、同一份 fixture，跑两次要得出一致的数字。',
	'我们并不追求编辑器和 VS Code 一模一样，而是找到"中文写作友好"这条差异化路径上最重要的问题。',
	'远程 host 到 webview 的消息桥接是一切协议的入口，任何形状不匹配都会在这里第一时间暴露。',
	'Round-trip 测试的核心不是"能打开"，而是"打开——保存——再打开，字节完全一致"。',
	'markdown 的 CommonMark / GFM 差异体现在列表、表格、任务列表这几个细节上，处理不好就会破坏往返一致性。',
	'代码块的语言识别不是为了炫技，而是让阅读者在长文档里能快速切换心智——中文段和 code fence 之间的过渡需要视觉锚点。',
	'当性能问题定位到序列化阶段时，先想的是避免整份文档重复解析，而不是替换 markdown 库。',
	'一个良好的性能基线，应当既能被 CI 断言，也能被人读懂，不需要跑一遍就理解每一列的含义。',
	'我们把大文档 fixture 用脚本合成而不是放真实语料，是因为真实语料受版权、隐私和体积三重限制。',
	'seed 固定的意义远不止"跑两次一样"——它让你能沿着同一份数据反复调试，直到问题定位在正确的位置。',
	'IME 场景在测试里往往被忽略，因为大部分测试是英文键入，而 composition 事件恰恰是英文键入路径上不会触发的。',
	'表格解析器面对不规则宽度的列时，需要在渲染阶段决定"补齐还是保留原样"，这个取舍决定了往返一致性。',
	'图片的相对路径解析牵扯到编辑器所在的目录约定，测试 fixture 里我们只放路径引用，不真的放图。',
	'块级公式（display math）和行内公式（inline math）走的是不同的 NodeView 编辑路径，任何一处错都是回归项。',
	'baseline 的选择要留有可比对的对照点：无 tag 时用最后一个"旧架构 commit"作为基准，比新起一个 tag 更实用。',
	'Phase 收官报告不是把每张表贴一遍，而是给出可以被独立验证的命令、commit、报告文件三元组。',
	'当我们说"打开耗时"时，度量的起止点必须精确到函数级，否则不同工程师会给出不同的数字。',
	'Milkdown 底层的 ProseMirror schema 是双向数据流的核心，任何自定义 NodeView 都必须尊重 schema 的约束。',
	'性能问题定位有一个反直觉的经验：最贵的操作往往不是你在 profiler 里看到最亮的那一条，而是它上游的准备工作。',
	'我们在 fixture 里混排代码块，是为了确保 markdown 解析在遇到 fence 时既不吞掉后续内容，也不会把 fence 内的东西继续当 markdown。',
	'如果一次改动让 P95 变差超过 20%，即便平均值不变，也应当被视为性能回归。',
	'编辑器面向"写作者"和面向"程序员"的取舍点，很多时候就是这一点点视觉密度的差异——但差异带来的舒适度是数量级的。',
	'一切自动化测试的目的都是让人从"跑一遍看看"里解脱出来，把时间留给真正需要人判断的部分。',
];

// ────────────────────────────────────────────────────────────────
// Chunk 生成器 —— 每个返回完整 markdown 段（末尾自带 \n\n）
// ────────────────────────────────────────────────────────────────
let sectionCounter = 0;

function makeParagraph(rng) {
	// 3-5 句中文，前面可能挂一个 h2 section 标题（约每 3 段一次）
	const sentenceCount = rng.int(3, 6);
	const shuffled = rng.shuffle(CN_SENTENCES).slice(0, sentenceCount);
	const paragraph = shuffled.join('');
	let text = '';
	if (rng.next() < 0.35) {
		text += `## Section ${sectionCounter++}\n\n`;
	}
	text += `${paragraph}\n\n`;
	return text;
}

const CODE_TEMPLATES = {
	js: (rng) => {
		const n = rng.int(6, 15);
		const lines = [
			'/**',
			' * 演示片段：状态机 tick',
			' */',
			`function tick(state) {`,
		];
		for (let i = 0; i < n; i++) {
			lines.push(`\tstate.counter${i} = (state.counter${i} || 0) + ${rng.int(1, 100)};`);
		}
		lines.push('\treturn state;', '}');
		return '```js\n' + lines.join('\n') + '\n```\n\n';
	},
	ts: (rng) => {
		const n = rng.int(5, 12);
		const lines = [
			'interface Sample {',
			'\tid: number;',
			'\tvalue: number;',
			'\tlabel: string;',
			'}',
			'',
			'export function build(samples: Sample[]): number {',
			'\tlet total = 0;',
		];
		for (let i = 0; i < n; i++) {
			lines.push(`\ttotal += samples[${i}]?.value ?? ${rng.int(1, 50)};`);
		}
		lines.push('\treturn total;', '}');
		return '```ts\n' + lines.join('\n') + '\n```\n\n';
	},
	py: (rng) => {
		const n = rng.int(6, 14);
		const lines = [
			'def process(records):',
			'\t"""聚合样本值."""',
			'\ttotal = 0',
		];
		for (let i = 0; i < n; i++) {
			lines.push(`\ttotal += records[${i}].get("value_${i}", ${rng.int(1, 200)})`);
		}
		lines.push('\treturn total');
		return '```python\n' + lines.join('\n') + '\n```\n\n';
	},
};

function makeCodeBlock(rng) {
	const lang = rng.pick(['js', 'ts', 'py']);
	return CODE_TEMPLATES[lang](rng);
}

function makeTable(rng) {
	const cols = rng.int(3, 6);
	const rows = rng.int(3, 8);
	const headers = [];
	const align = [];
	for (let c = 0; c < cols; c++) {
		headers.push(`列 ${c + 1}`);
		align.push('---');
	}
	const out = [
		'| ' + headers.join(' | ') + ' |',
		'| ' + align.join(' | ') + ' |',
	];
	for (let r = 0; r < rows; r++) {
		const cells = [];
		for (let c = 0; c < cols; c++) {
			// 混排中英数字
			if (c === 0) { cells.push(`R${r + 1}`); }
			else if (c === cols - 1) { cells.push(String(rng.int(10, 999))); }
			else { cells.push(rng.pick(['数据', '样本', '备注', '标签', 'ok', 'n/a'])); }
		}
		out.push('| ' + cells.join(' | ') + ' |');
	}
	return out.join('\n') + '\n\n';
}

function makeImage(rng) {
	const n = rng.int(1, 999);
	const alt = rng.pick(['示意图', '流程图', '架构图', '截图', '数据图']);
	return `![${alt}](assets/perf-${n}.png)\n\n`;
}

function makeMath(rng) {
	// 30% block $$...$$，70% inline 段（1~2 个 $...$ 嵌在文字里）
	if (rng.next() < 0.30) {
		const blocks = [
			'$$\nE = mc^2\n$$',
			'$$\n\\int_{0}^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}\n$$',
			'$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$',
			'$$\n\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1\n$$',
			'$$\nf(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}\n$$',
		];
		return rng.pick(blocks) + '\n\n';
	}
	const inlines = ['$a^2 + b^2 = c^2$', '$\\pi \\approx 3.14159$', '$O(n \\log n)$', '$\\alpha, \\beta, \\gamma$'];
	const prefix = rng.pick(['行内公式示例：', '公式片段：', '数学表示：']);
	return `${prefix}${rng.pick(inlines)}，此外还有 ${rng.pick(inlines)}。\n\n`;
}

// ────────────────────────────────────────────────────────────────
// 主生成逻辑：按字节配比 greedy 分配
// ────────────────────────────────────────────────────────────────
const QUOTA = {
	paragraph: 0.60,
	code: 0.20,
	table: 0.10,
	image: 0.05,
	math: 0.05,
};

function pickNextType(used, target, rng) {
	// 挑选"实际占比 / 目标占比"最低的类型（deficit ratio 最大）
	// 图片/数学粒度很小，会自然更快追上；用相对比而不是绝对差以避免大类被无限追。
	let bestType = 'paragraph';
	let bestDeficit = -Infinity;
	for (const t of Object.keys(QUOTA)) {
		const want = QUOTA[t] * target;
		const have = used[t];
		const deficit = (want - have) / want; // 归一化
		if (deficit > bestDeficit) {
			bestDeficit = deficit;
			bestType = t;
		}
	}
	// 罕见并列时用 rng 微扰，仍保持确定性（rng 是 seeded）
	void rng;
	return bestType;
}

function generate(targetBytes) {
	const rng = createRng(42);
	sectionCounter = 0;

	const header = `# Perf fixture — 合成 ${(targetBytes / 1_000_000).toFixed(0)} MB 混排文档\n\n`
		+ '> 本文件由 `code-oss/test/scripts/gen-perf-fixture.mjs` 生成。\n'
		+ '> seed=42，同命令跑两次字节完全一致。\n\n';

	const chunks = [header];
	const used = { paragraph: 0, code: 0, table: 0, image: 0, math: 0 };
	let total = Buffer.byteLength(header, 'utf8');

	const generators = {
		paragraph: makeParagraph,
		code: makeCodeBlock,
		table: makeTable,
		image: makeImage,
		math: makeMath,
	};

	while (total < targetBytes) {
		const type = pickNextType(used, targetBytes, rng);
		const chunk = generators[type](rng);
		const len = Buffer.byteLength(chunk, 'utf8');
		// 如果新加块会把总字节推超 target 太多（> 5%），改用一个最小的段落片段收尾
		if (total + len > targetBytes * 1.05) {
			// 用一个短句结尾，尽量贴近 target
			const need = Math.max(0, targetBytes - total);
			if (need <= 0) { break; }
			const s = CN_SENTENCES[0].slice(0, Math.min(CN_SENTENCES[0].length, Math.floor(need / 3)));
			const tail = s + '\n';
			chunks.push(tail);
			used.paragraph += Buffer.byteLength(tail, 'utf8');
			total += Buffer.byteLength(tail, 'utf8');
			break;
		}
		chunks.push(chunk);
		used[type] += len;
		total += len;
	}

	return { text: chunks.join(''), used, total };
}

// ────────────────────────────────────────────────────────────────
// main
// ────────────────────────────────────────────────────────────────
function defaultOut(size, repoRoot) {
	const mb = Math.round(size / 1_000_000);
	const name = `${mb}mb-mixed.md`;
	return resolve(repoRoot, 'code-oss/src/vs/workbench/contrib/vsword/test/fixtures/roundtrip/perf', name);
}

function main() {
	let args;
	try {
		args = parseArgs(process.argv.slice(2));
	} catch (e) {
		console.error(String(e.message || e));
		process.exit(2);
	}
	if (args.help || (!args.size)) {
		process.stdout.write(HELP);
		process.exit(args.help ? 0 : 2);
	}
	const target = parseSize(args.size);
	// 定位 repo root：脚本在 <root>/code-oss/test/scripts/，上溯 3 层
	const scriptDir = dirname(fileURLToPath(import.meta.url));
	const repoRoot = resolve(scriptDir, '..', '..', '..');
	const outPath = args.out ? resolve(process.cwd(), args.out) : defaultOut(target, repoRoot);

	const t0 = Date.now();
	const { text, used, total } = generate(target);
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, text, 'utf8');
	const dt = Date.now() - t0;

	const pct = (n) => ((n / total) * 100).toFixed(1) + '%';
	const dev = (((total - target) / target) * 100).toFixed(2);
	console.log(`✔ 生成：${outPath}`);
	console.log(`  目标 ${target} B / 实际 ${total} B（偏差 ${dev}%）· 用时 ${dt} ms`);
	console.log(`  配比：段落 ${pct(used.paragraph)} · 代码 ${pct(used.code)} · 表格 ${pct(used.table)} · 图片 ${pct(used.image)} · 数学 ${pct(used.math)}`);
}

main();
