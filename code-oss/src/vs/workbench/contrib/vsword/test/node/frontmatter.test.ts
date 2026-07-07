/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5c.3 · frontmatter helpers（纯函数，无 Milkdown / DOM 依赖，无 npm 依赖）。
// verify.template.mjs 里跑的是同一批断言的 fixture round-trip 版本；这里补 mocha
// 覆盖，让 CI 单测阶段就能拦住回归——不用等 .tmp/milkdown-prod-builder 重打。

import * as assert from 'assert';
import {
	FLAVORS,
	isValidFlavor,
	extractTopLevelKeys,
	summarizeFrontmatter,
	formatSummaryLabel,
	firstLineOfError,
	detectFrontmatterError,
	stripFence,
	addFence,
	FLAVOR_FENCE,
} from '../../browser/milkdownEditor/webview/frontmatter-helpers.template.js';

// --- FLAVORS / isValidFlavor -------------------------------------------------

suite('T-3.5c.3 · FLAVORS / isValidFlavor', () => {
	test('FLAVORS 是冻结数组，含 yaml/toml/json', () => {
		assert.ok(Object.isFrozen(FLAVORS));
		assert.ok(FLAVORS.includes('yaml'));
		assert.ok(FLAVORS.includes('toml'));
		assert.ok(FLAVORS.includes('json'));
	});

	test('isValidFlavor 接受合法值', () => {
		assert.strictEqual(isValidFlavor('yaml'), true);
		assert.strictEqual(isValidFlavor('toml'), true);
		assert.strictEqual(isValidFlavor('json'), true);
	});

	test('isValidFlavor 拒绝非法值 / 非字符串', () => {
		assert.strictEqual(isValidFlavor('xml'), false);
		// isValidFlavor 参数为 unknown，null/42 都是合法调用；这里只断言运行时行为。
		assert.strictEqual(isValidFlavor(null), false);
		assert.strictEqual(isValidFlavor(42), false);
		assert.strictEqual(isValidFlavor(''), false);
	});

	test('FLAVOR_FENCE 也是冻结的常量表', () => {
		assert.ok(Object.isFrozen(FLAVOR_FENCE));
		assert.strictEqual(FLAVOR_FENCE.yaml.open, '---');
		assert.strictEqual(FLAVOR_FENCE.toml.open, '+++');
	});
});

// --- extractTopLevelKeys -----------------------------------------------------

suite('T-3.5c.3 · extractTopLevelKeys (YAML)', () => {
	test('抽顶层键，跳过嵌套', () => {
		const keys = extractTopLevelKeys('title: hi\ntags:\n  - a\n  - b\nauthor: me\n', 'yaml');
		assert.deepStrictEqual(keys, ['title', 'tags', 'author']);
	});

	test('注释 / 空行不算键', () => {
		const keys = extractTopLevelKeys('# 头部注释\n\ntitle: hi\n# 中间注释\ndraft: true\n', 'yaml');
		assert.deepStrictEqual(keys, ['title', 'draft']);
	});

	test('引号包裹的 key 也认', () => {
		const keys = extractTopLevelKeys('"my key": 1\n\'other\': 2\n', 'yaml');
		assert.deepStrictEqual(keys, ['my key', 'other']);
	});

	test('去重（同名只留第一个）', () => {
		const keys = extractTopLevelKeys('title: 1\ntitle: 2\n', 'yaml');
		assert.deepStrictEqual(keys, ['title']);
	});

	test('空字符串 / 非字符串 → 空数组', () => {
		assert.deepStrictEqual(extractTopLevelKeys('', 'yaml'), []);
		assert.deepStrictEqual(extractTopLevelKeys(null as any, 'yaml'), []);
	});
});

suite('T-3.5c.3 · extractTopLevelKeys (TOML)', () => {
	test('抽根表 key = value，section 之后停止', () => {
		const keys = extractTopLevelKeys('title = "x"\ndate = 2026-01-01\n\n[server]\nport = 80\n', 'toml');
		assert.deepStrictEqual(keys, ['title', 'date']);
	});

	test('注释跳过', () => {
		const keys = extractTopLevelKeys('# top\ntitle = "x"\n# mid\nauthor = "y"\n', 'toml');
		assert.deepStrictEqual(keys, ['title', 'author']);
	});
});

suite('T-3.5c.3 · extractTopLevelKeys (JSON)', () => {
	test('平顶层键，嵌套不计', () => {
		const keys = extractTopLevelKeys('{"a": 1, "b": {"nested": true}, "c": [1,2]}', 'json');
		assert.deepStrictEqual(keys, ['a', 'b', 'c']);
	});

	test('转义 key', () => {
		const keys = extractTopLevelKeys('{"with \\"quote": 1, "with\\\\bs": 2}', 'json');
		assert.strictEqual(keys.length, 2);
		assert.strictEqual(keys[0], 'with "quote');
	});

	test('非对象顶层 → 空', () => {
		assert.deepStrictEqual(extractTopLevelKeys('[1,2,3]', 'json'), []);
		assert.deepStrictEqual(extractTopLevelKeys('"a string"', 'json'), []);
	});

	test('语法半坏也尽力返回已收集到的键', () => {
		const keys = extractTopLevelKeys('{"a": 1, "b": 2,', 'json');
		assert.deepStrictEqual(keys, ['a', 'b']);
	});
});

// --- summarizeFrontmatter + formatSummaryLabel -------------------------------

suite('T-3.5c.3 · summarizeFrontmatter + formatSummaryLabel', () => {
	test('YAML: 抽 title + 字段数', () => {
		const s = summarizeFrontmatter('title: Hello\ntags: [a, b]\ndraft: false\n', 'yaml');
		assert.strictEqual(s.title, 'Hello');
		assert.strictEqual(s.fieldCount, 3);
		assert.strictEqual(s.flavor, 'yaml');
	});

	test('YAML: 去掉引号包裹的 title', () => {
		const s = summarizeFrontmatter('title: "带 空格 的标题"\n', 'yaml');
		assert.strictEqual(s.title, '带 空格 的标题');
	});

	test('TOML: 抽 title', () => {
		const s = summarizeFrontmatter('title = "Post"\ndate = 2026-01-01\n', 'toml');
		assert.strictEqual(s.title, 'Post');
		assert.strictEqual(s.fieldCount, 2);
	});

	test('JSON: 通过 JSON.parse 抽 title', () => {
		const s = summarizeFrontmatter('{"title":"J","x":1}', 'json');
		assert.strictEqual(s.title, 'J');
		assert.strictEqual(s.fieldCount, 2);
	});

	test('无 title 时 title 为 null', () => {
		const s = summarizeFrontmatter('draft: true\nauthor: me\n', 'yaml');
		assert.strictEqual(s.title, null);
		assert.strictEqual(s.fieldCount, 2);
	});

	test('formatSummaryLabel: 有 title 显示 title', () => {
		assert.strictEqual(
			formatSummaryLabel({ flavor: 'yaml', title: 'Hi', keys: ['a'], fieldCount: 1 }),
			'📄 Hi · 1 fields',
		);
	});

	test('formatSummaryLabel: 无 title 显示 flavor 大写', () => {
		assert.strictEqual(
			formatSummaryLabel({ flavor: 'toml', title: null, keys: ['a'], fieldCount: 1 }),
			'📄 TOML · 1 fields',
		);
	});

	test('formatSummaryLabel: 零字段 → 空态', () => {
		assert.strictEqual(
			formatSummaryLabel({ flavor: 'yaml', title: null, keys: [], fieldCount: 0 }),
			'📄 YAML（空）',
		);
	});
});

// --- firstLineOfError --------------------------------------------------------

suite('T-3.5c.3 · firstLineOfError', () => {
	test('js-yaml mark 形状 → line/column 加 1', () => {
		const err = { message: 'bad indent', mark: { line: 2, column: 4, position: 42 } };
		const out = firstLineOfError(err, 'yaml');
		assert.strictEqual(out.line, 3);
		assert.strictEqual(out.column, 5);
		assert.strictEqual(out.message, 'bad indent');
	});

	test('TOML "at row N, col M" 形状', () => {
		const err = new Error('Unknown character "%" at row 5, col 12, pos 60:');
		const out = firstLineOfError(err, 'toml');
		assert.strictEqual(out.line, 5);
		assert.strictEqual(out.column, 12);
	});

	test('通用 Error 回退到 line=1', () => {
		const out = firstLineOfError(new Error('oops'), 'yaml');
		assert.strictEqual(out.line, 1);
		assert.strictEqual(out.column, null);
		assert.strictEqual(out.message, 'oops');
	});

	test('null / undefined → 空消息 line=1', () => {
		assert.deepStrictEqual(firstLineOfError(null), { line: 1, column: null, message: '' });
		assert.deepStrictEqual(firstLineOfError(undefined), { line: 1, column: null, message: '' });
	});

	test('message 里的第一行', () => {
		const err = { message: 'first line\nsecond line' };
		assert.strictEqual(firstLineOfError(err, 'yaml').message, 'first line');
	});
});

// --- detectFrontmatterError --------------------------------------------------

suite('T-3.5c.3 · detectFrontmatterError', () => {
	test('parser 缺失时返回 null（视为「无法验证」= 不报错）', () => {
		assert.strictEqual(detectFrontmatterError('title: x\n', 'yaml', {}), null);
		assert.strictEqual(detectFrontmatterError('title: x\n', 'yaml', undefined), null);
	});

	test('parser 成功 → null', () => {
		const parsers = { yaml: (v: string) => JSON.parse('{}') };
		assert.strictEqual(detectFrontmatterError('anything', 'yaml', parsers), null);
	});

	test('parser 失败 → 返回 error 结构', () => {
		const parsers = {
			yaml: (_v: string) => { const e: any = new Error('bad'); e.mark = { line: 3, column: 1 }; throw e; },
		};
		const out = detectFrontmatterError('...', 'yaml', parsers);
		assert.ok(out);
		assert.strictEqual(out!.line, 4);
		assert.strictEqual(out!.message, 'bad');
	});

	test('非法 flavor → null', () => {
		assert.strictEqual(detectFrontmatterError('x', 'xml' as any, { xml: () => { throw new Error('x'); } } as any), null);
	});
});

// --- stripFence / addFence ---------------------------------------------------

suite('T-3.5c.3 · stripFence / addFence', () => {
	test('YAML: 剥 --- fence', () => {
		assert.strictEqual(stripFence('---\ntitle: x\n---', 'yaml'), 'title: x');
	});

	test('TOML: 剥 +++ fence', () => {
		assert.strictEqual(stripFence('+++\ntitle = "x"\n+++', 'toml'), 'title = "x"');
	});

	test('输入不含 fence 时原样返回', () => {
		assert.strictEqual(stripFence('just text', 'yaml'), 'just text');
	});

	test('YAML: 加 --- fence，尾部只补一个换行', () => {
		assert.strictEqual(addFence('title: x', 'yaml'), '---\ntitle: x\n---');
		assert.strictEqual(addFence('title: x\n', 'yaml'), '---\ntitle: x\n---');
	});

	test('TOML: 加 +++ fence', () => {
		assert.strictEqual(addFence('title = "x"', 'toml'), '+++\ntitle = "x"\n+++');
	});

	test('null/undefined 内部内容不抛', () => {
		assert.strictEqual(addFence(null as any, 'yaml'), '---\n\n---');
	});
});
