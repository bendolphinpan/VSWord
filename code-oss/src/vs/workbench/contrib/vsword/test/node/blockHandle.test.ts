/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8 — block handle helpers: eligibility + transform enablement + menu grouping.
// Pure functions; no Milkdown / DOM imports.

import * as assert from 'assert';
import {
	TRANSFORM_ITEMS,
	BLOCK_ACTIONS,
	HANDLE_ELIGIBLE,
	shouldShowHandle,
	nodeTypeLabel,
	isTransformEnabled,
	buildMenuGroups,
} from '../../browser/milkdownEditor/webview/block-handle-helpers.template.js';

suite('T-3.8 · block-handle catalogue', () => {
	test('TRANSFORM_ITEMS covers the 10 canonical block conversions', () => {
		const ids = TRANSFORM_ITEMS.map(i => i.id);
		assert.deepStrictEqual(ids, ['paragraph','h1','h2','h3','h4','quote','bullet','ordered','code','math']);
	});

	test('TRANSFORM_ITEMS entries are immutable', () => {
		assert.ok(Object.isFrozen(TRANSFORM_ITEMS));
	});

	test('every transform entry has command | id=math (which inserts directly)', () => {
		for (const item of TRANSFORM_ITEMS) {
			if (item.id === 'math') assert.strictEqual(item.command, null);
			else assert.ok(item.command && item.command.endsWith('Command'), `${item.id} needs a command key`);
		}
	});

	test('heading entries carry their level in `arg` (used by wrapInHeadingCommand)', () => {
		for (let level = 1; level <= 4; level++) {
			const h = TRANSFORM_ITEMS.find(i => i.id === `h${level}`);
			assert.strictEqual(h!.arg, level);
		}
	});

	test('BLOCK_ACTIONS covers copy / delete / move up-down', () => {
		assert.deepStrictEqual(BLOCK_ACTIONS.map(a => a.id), ['duplicate','delete','moveUp','moveDown']);
	});
});

suite('T-3.8 · shouldShowHandle', () => {
	test('accepts every eligible top-level block type', () => {
		for (const t of HANDLE_ELIGIBLE) {
			assert.strictEqual(shouldShowHandle({ typeName: t }, []), true, `${t} should be eligible`);
		}
	});

	test('rejects unknown types', () => {
		assert.strictEqual(shouldShowHandle({ typeName: 'text' }, []), false);
		assert.strictEqual(shouldShowHandle({ typeName: 'hard_break' }, []), false);
	});

	test('Q5=b: rejects anything inside a table ancestor chain', () => {
		assert.strictEqual(shouldShowHandle({ typeName: 'paragraph' }, ['doc', 'table', 'table_row']), false);
	});

	test('Q5=b: rejects anything inside a list_item ancestor chain', () => {
		assert.strictEqual(shouldShowHandle({ typeName: 'paragraph' }, ['doc', 'bullet_list', 'list_item']), false);
	});

	test('accepts a bullet_list at the top level (list container itself is draggable)', () => {
		assert.strictEqual(shouldShowHandle({ typeName: 'bullet_list' }, ['doc']), true);
	});

	test('null / undefined node → false (defensive)', () => {
		assert.strictEqual(shouldShowHandle(null as any, []), false);
		assert.strictEqual(shouldShowHandle(undefined as any, []), false);
	});
});

suite('T-3.8 · nodeTypeLabel', () => {
	test('common block types get Chinese labels', () => {
		assert.strictEqual(nodeTypeLabel('paragraph'), '正文');
		assert.strictEqual(nodeTypeLabel('blockquote'), '引用');
		assert.strictEqual(nodeTypeLabel('bullet_list'), '无序列表');
		assert.strictEqual(nodeTypeLabel('code_block'), '代码块');
	});

	test('heading label carries the level from attrs', () => {
		assert.strictEqual(nodeTypeLabel('heading', { level: 2 }), '标题 2');
		assert.strictEqual(nodeTypeLabel('heading', { level: 4 }), '标题 4');
	});

	test('unknown types fall back to the raw type name', () => {
		assert.strictEqual(nodeTypeLabel('something_new'), 'something_new');
		assert.strictEqual(nodeTypeLabel(''), '');
	});
});

suite('T-3.8 · isTransformEnabled', () => {
	const item = (id: string) => TRANSFORM_ITEMS.find((i: { id: string }) => i.id === id);

	test('same-shape transforms are disabled (no-op safety)', () => {
		assert.strictEqual(isTransformEnabled(item('paragraph'), { typeName: 'paragraph' }), false);
		assert.strictEqual(isTransformEnabled(item('code'),      { typeName: 'code_block' }), false);
		assert.strictEqual(isTransformEnabled(item('bullet'),    { typeName: 'bullet_list' }), false);
	});

	test('heading-of-same-level disabled; different level enabled', () => {
		const h2 = item('h2');
		assert.strictEqual(isTransformEnabled(h2, { typeName: 'heading', attrs: { level: 2 } }), false);
		assert.strictEqual(isTransformEnabled(h2, { typeName: 'heading', attrs: { level: 3 } }), true);
	});

	test('cross-type transforms are enabled', () => {
		assert.strictEqual(isTransformEnabled(item('h1'), { typeName: 'paragraph' }), true);
		assert.strictEqual(isTransformEnabled(item('quote'), { typeName: 'paragraph' }), true);
	});
});

suite('T-3.8 · buildMenuGroups', () => {
	test('groups transforms + actions with the block\'s title', () => {
		const g = buildMenuGroups({ typeName: 'heading', attrs: { level: 2 } });
		assert.strictEqual(g.title, '标题 2');
		assert.strictEqual(g.transforms.length, TRANSFORM_ITEMS.length);
		assert.strictEqual(g.actions.length, BLOCK_ACTIONS.length);
	});

	test('h2 group flags h2 as disabled but others enabled', () => {
		const g = buildMenuGroups({ typeName: 'heading', attrs: { level: 2 } });
		const h2 = g.transforms.find((t: { id: string }) => t.id === 'h2');
		const h3 = g.transforms.find((t: { id: string }) => t.id === 'h3');
		assert.strictEqual(h2!.enabled, false);
		assert.strictEqual(h3!.enabled, true);
	});

	test('actions are always enabled (host commands decide the rest)', () => {
		const g = buildMenuGroups({ typeName: 'paragraph' });
		for (const a of g.actions) assert.strictEqual(a.enabled, true);
	});
});
