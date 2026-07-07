/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7c.1.a · TOC [TOC] 占位符 fixture round-trip 单测。
//
// 覆盖 PRD §5 AC-5（字节一致 · 决策 D-11）+ DoD 第 5 / 7 项：
//   1) 元测试：TOC_FIXTURES.length === 3，磁盘上 3 份 .md 都存在。
//   2) 每个 fixture 走完整 remark pipeline：
//         parse → tocRemarkTransform → stringify (+ TYPORA options + tocMarker handler)
//      与原文件字节完全一致。
//   3) tocNode.toMarkdown runner 用 mock state 单测：
//         openNode('paragraph') + addNode('text', undefined, '[TOC]') + closeNode。
//
// 这里刻意不拉起 Milkdown Editor（那需要 jsdom + 全套 plugin），改在 mdast 层直接跑
// 与真编辑器同一套 remark stringifier（TYPORA_STRINGIFY_OPTIONS 与 entry.template.js
// 对齐），行为等价于 PRD §4.7 描述的「open → save」链路的 markdown ↔ markdown 段。
// PM schema toMarkdown runner 的正确性通过 mock state 断言另证。
//
// PRD §4.4 提到 tocNode 序列化时会写回 paragraph[text '[TOC]']，remark-stringify
// 默认对 tocMarker 节点没有 handler，会退化成空段落 → 与 fixture 不字节一致；因此
// 这里注册一个 tocMarker handler 直接吐 '[TOC]'，语义上等价于 tocNode.toMarkdown
// runner 里 openNode('paragraph') + addNode('text', '[TOC]') + closeNode。

import * as assert from 'assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import {
	tocRemarkTransform,
} from '../../browser/milkdownEditor/webview/toc-remark.template.js';
import {
	tocNode,
	TOC_NODE_NAME,
	TOC_MDAST_TYPE,
	TOC_LITERAL,
} from '../../browser/milkdownEditor/webview/toc-node.template.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { TOC_FIXTURES } from '../fixtures/toc/_index.mjs';

// ---------------------------------------------------------------------------
// fixture 根目录发现（同 mermaidRoundtrip.test.ts 的多候选兜底套路）
// ---------------------------------------------------------------------------

const HERE = (() => {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const u = typeof (import.meta as any) !== 'undefined' ? (import.meta as any).url : undefined;
		if (u) { return path.dirname(url.fileURLToPath(u)); }
	} catch { /* fall through */ }
	return typeof __dirname !== 'undefined' ? __dirname : process.cwd();
})();

const FIXTURE_ROOT = (() => {
	const candidates = [
		path.resolve(HERE, '..', 'fixtures', 'toc'),
		path.resolve(process.cwd(), 'src/vs/workbench/contrib/vsword/test/fixtures/toc'),
		path.resolve(process.cwd(), 'code-oss/src/vs/workbench/contrib/vsword/test/fixtures/toc'),
		'D:/GIT/VSWord/code-oss/src/vs/workbench/contrib/vsword/test/fixtures/toc',
	];
	for (const c of candidates) {
		if (fs.existsSync(c)) { return c; }
	}
	return candidates[0];
})();

// ---------------------------------------------------------------------------
// 与 entry.template.js 对齐的 Typora-风格 stringify options
// ---------------------------------------------------------------------------

// 复用 entry.template.js 里的常量含义；这里就地拷贝一份而不 import，避免把
// entry 拽进单测 bundle（它依赖整套 Milkdown / plugin-upload 等 webview-only 模块）。
const TYPORA_STRINGIFY_OPTIONS = {
	bullet: '-',
	bulletOrdered: '.',
	emphasis: '*',
	strong: '*',
	fences: true,
	listItemIndent: 'one',
	rule: '-',
	ruleRepetition: 3,
	ruleSpaces: false,
	tightDefinitions: true,
	resourceLink: false,
	setext: false,
	incrementListMarker: true,
} as const;

/**
 * 端到端 md → mdast → md：
 *   1. remark-parse 生成 mdast
 *   2. tocRemarkTransform 把 `[TOC]` paragraph 升级成 tocMarker 节点
 *   3. remark-stringify（配 Typora 选项 + tocMarker → '[TOC]' handler）序列化回 md
 * 这就是 Milkdown 走 remark 全链路时同一份 markdown 的 parse-then-serialize 结果。
 */
function roundtrip(source: string): string {
	const processor = unified()
		.use(remarkParse)
		.use(() => (tree: any) => { tocRemarkTransform(tree); })
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		.use(remarkStringify as any, {
			...TYPORA_STRINGIFY_OPTIONS,
			// PRD §4.7 决策 D-11：占位符按原样写回 `[TOC]`（含不含大小写变体一律归一）。
			// remark-stringify handlers 期望返回节点文本；这里 tocMarker 节点已经不带 children，
			// 直接吐 '[TOC]' 与文档流一致。
			handlers: {
				tocMarker: () => '[TOC]',
			},
		});
	return String(processor.processSync(source));
}

// ---------------------------------------------------------------------------
// Suite 1 · fixture 元测试
// ---------------------------------------------------------------------------

suite('T-3.7c.1.a · TOC fixture 清单', () => {
	test('TOC_FIXTURES 长度为 3（PRD §6 拆分表 · a 卡 P0 fixture 数）', () => {
		assert.strictEqual(TOC_FIXTURES.length, 3);
	});

	test('每条 fixture 的 .md 文件在磁盘上存在', () => {
		for (const fx of TOC_FIXTURES) {
			const p = path.join(FIXTURE_ROOT, fx.file);
			assert.ok(fs.existsSync(p), `missing fixture file: ${p}`);
		}
	});

	test('每条 fixture tier 都是 P0（本模块单档）', () => {
		for (const fx of TOC_FIXTURES) {
			assert.strictEqual(fx.tier, 'P0', `fixture ${fx.id} tier ≠ P0`);
		}
	});
});

// ---------------------------------------------------------------------------
// Suite 2 · 3 fixture 各自 round-trip 字节一致（PRD AC-5 · 决策 D-11）
// ---------------------------------------------------------------------------

suite('T-3.7c.1.a · TOC fixture round-trip 字节一致', () => {
	for (const fx of TOC_FIXTURES) {
		test(`${fx.id} · ${fx.description}`, () => {
			const p = path.join(FIXTURE_ROOT, fx.file);
			// 用 fs.readFileSync 拿到磁盘字节后 normalize CRLF → LF：
			// git autocrlf 在 Windows 上可能把源文件写成 CRLF；这不是本任务关心的
			// 格式差异（Typora 也用 LF）。归一后与 roundtrip 输出比对。
			const raw = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
			const out = roundtrip(raw);
			assert.strictEqual(
				out,
				raw,
				`${fx.id}: roundtrip 输出与源文件字节不一致（PRD §4.7 决策 D-11）`
			);
		});
	}
});

// ---------------------------------------------------------------------------
// Suite 3 · tocNode.toMarkdown runner 单测（mock state）
// ---------------------------------------------------------------------------
//
// 直接跑 Milkdown Editor 需要拉起 jsdom + PM + prosemirror-transform 全家桶；这里
// 只想验证 toMarkdown runner 的调用序列，用一个记录调用的 mock state 就够。
//
// runner 期望的行为（对齐 preset-commonmark 里 paragraph 的写法）：
//   state.openNode('paragraph')
//   state.addNode('text', undefined, '[TOC]')
//   state.closeNode()
// 与之呼应，parseMarkdown runner 期望：
//   state.addNode(type)     // type = PM schema 里注册的 'toc_marker' NodeType
//
// tocNode 由 `$nodeSchema('toc_marker', factoryFn)` 产出；我们用 (ctx) => spec 提取
// spec，然后 spec.parseMarkdown / spec.toMarkdown 就是 runner 定义。

interface MockCall { kind: string; args: any[]; }

function makeMockState(): { state: any; calls: MockCall[]; } {
	const calls: MockCall[] = [];
	const state = {
		openNode(...args: any[]) { calls.push({ kind: 'openNode', args }); return state; },
		closeNode(...args: any[]) { calls.push({ kind: 'closeNode', args }); return state; },
		addNode(...args: any[]) { calls.push({ kind: 'addNode', args }); return state; },
	};
	return { state, calls };
}

/**
 * 从 `$nodeSchema` 生产的 plugin 上拿到 spec。Milkdown 6.x 的 $nodeSchema 会把
 * schema 挂在若干 ctx key 上；对本单测唯一相关的是 `parseMarkdown` / `toMarkdown`
 * 两个 runner 的调用序列。这里通过反射直接取 spec object。
 */
function extractTocSpec(): any {
	// $nodeSchema 返回的是若干 $ctx / $node plugin 的组合，spec factory 藏在
	// meta 里；不同 Milkdown 版本细节不同，兼容做法是遍历所有属性找形如
	// { toMarkdown: { match, runner }, parseMarkdown: { match, runner } } 的对象。
	const seen = new WeakSet<object>();
	const stack: any[] = [tocNode as any];
	while (stack.length) {
		const cur = stack.pop();
		if (!cur || typeof cur !== 'object' || seen.has(cur)) { continue; }
		seen.add(cur);
		if (cur.toMarkdown && cur.parseMarkdown &&
			typeof cur.toMarkdown.runner === 'function' &&
			typeof cur.parseMarkdown.runner === 'function') {
			return cur;
		}
		for (const k of Object.keys(cur)) {
			try {
				const v = cur[k];
				if (v && typeof v === 'object') { stack.push(v); }
				if (typeof v === 'function' && v.length <= 1) {
					// factory 形式 (ctx) => spec / () => spec；尝试调用一次拿返回值。
					try {
						const r = v.length === 0 ? v() : v({ get() { /* mock ctx */ } });
						if (r && typeof r === 'object') { stack.push(r); }
					} catch { /* ignore factory errors */ }
				}
			} catch { /* ignore */ }
		}
	}
	throw new Error('tocNode spec (with parseMarkdown/toMarkdown) not found');
}

suite('T-3.7c.1.a · tocNode schema · 常量 & schema 名', () => {
	test('TOC_NODE_NAME === "toc_marker"', () => {
		assert.strictEqual(TOC_NODE_NAME, 'toc_marker');
	});
	test('TOC_MDAST_TYPE === "tocMarker"', () => {
		assert.strictEqual(TOC_MDAST_TYPE, 'tocMarker');
	});
	test('TOC_LITERAL === "[TOC]"（PRD 决策 D-11 字面量固定）', () => {
		assert.strictEqual(TOC_LITERAL, '[TOC]');
	});
});

suite('T-3.7c.1.a · tocNode.toMarkdown runner', () => {
	let spec: any;
	suiteSetup(() => { spec = extractTocSpec(); });

	test('toMarkdown.match: PM node.type.name === "toc_marker" 时返回 true', () => {
		const ok = spec.toMarkdown.match({ type: { name: TOC_NODE_NAME } } as any);
		assert.strictEqual(ok, true);
	});

	test('toMarkdown.match: 其他节点名返回 false', () => {
		assert.strictEqual(spec.toMarkdown.match({ type: { name: 'paragraph' } } as any), false);
		assert.strictEqual(spec.toMarkdown.match({ type: { name: 'heading' } } as any), false);
	});

	test('toMarkdown.runner: openNode("paragraph") + addNode("text", undefined, "[TOC]") + closeNode', () => {
		const { state, calls } = makeMockState();
		// 第二个参数是 PM node（不参与断言，传空对象即可）
		spec.toMarkdown.runner(state, {} as any);
		assert.strictEqual(calls.length, 3, 'runner 应恰好触发 3 次 state 调用');
		assert.strictEqual(calls[0].kind, 'openNode');
		assert.strictEqual(calls[0].args[0], 'paragraph');
		assert.strictEqual(calls[1].kind, 'addNode');
		assert.strictEqual(calls[1].args[0], 'text');
		// preset-commonmark text handler 签名：addNode('text', attrs, value) — 第三个参数是文字。
		assert.strictEqual(calls[1].args[2], TOC_LITERAL);
		assert.strictEqual(calls[2].kind, 'closeNode');
	});
});

suite('T-3.7c.1.a · tocNode.parseMarkdown runner', () => {
	let spec: any;
	suiteSetup(() => { spec = extractTocSpec(); });

	test('parseMarkdown.match: mdast node.type === "tocMarker" 时返回 true', () => {
		assert.strictEqual(spec.parseMarkdown.match({ type: TOC_MDAST_TYPE } as any), true);
	});

	test('parseMarkdown.match: 其他 mdast 类型返回 false', () => {
		assert.strictEqual(spec.parseMarkdown.match({ type: 'paragraph' } as any), false);
		assert.strictEqual(spec.parseMarkdown.match({ type: 'text' } as any), false);
	});

	test('parseMarkdown.runner: 调用 addNode(type)', () => {
		const { state, calls } = makeMockState();
		const pmType = { name: TOC_NODE_NAME } as any;
		spec.parseMarkdown.runner(state, {} as any, pmType);
		assert.strictEqual(calls.length, 1);
		assert.strictEqual(calls[0].kind, 'addNode');
		assert.strictEqual(calls[0].args[0], pmType);
	});
});
