/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8b.1 · 图片打包策略对比：data-uri vs sibling-folder。

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	assembleExportHtml,
	rewriteImageSources,
	type ExportImageResource,
} from '../../browser/milkdownEditor/exportHtmlAssemble.js';

function makeResources(entries: ReadonlyArray<readonly [string, ExportImageResource]>): Map<string, ExportImageResource> {
	return new Map(entries);
}

suite('T-3.8b.1 · exportHtmlAssemble · imageMode', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const baseInput = {
		bodyInnerHtml: '<p><img src="./pic/one.png" alt="一"><img src="./pic/two.jpg" alt="二"></p>',
		themeCss: '',
		prismCss: '',
		themeId: 'github',
		title: 'note',
	};

	const resources = makeResources([
		['./pic/one.png', { originalSrc: './pic/one.png', mime: 'image/png', base64: 'AAAAB' }],
		['./pic/two.jpg', { originalSrc: './pic/two.jpg', mime: 'image/jpeg', base64: 'CCCCD' }],
	]);

	test('data-uri 模式：<img src="data:image/…;base64,…">', () => {
		const out = assembleExportHtml({
			...baseInput,
			imageMode: 'data-uri',
			imageResources: resources,
		});
		assert.ok(out.html.includes('src="data:image/png;base64,AAAAB"'), 'png data-uri missing');
		assert.ok(out.html.includes('src="data:image/jpeg;base64,CCCCD"'), 'jpg data-uri missing');
		assert.strictEqual(out.assets, undefined, 'data-uri should not emit assets');
	});

	test('sibling-folder 模式：<img src="<title>_files/…"> + assets 数组非空', () => {
		const out = assembleExportHtml({
			...baseInput,
			imageMode: 'sibling-folder',
			imageResources: resources,
		});
		assert.ok(out.html.includes('src="note_files/one.png"'), 'sibling src for png missing');
		assert.ok(out.html.includes('src="note_files/two.jpg"'), 'sibling src for jpg missing');
		assert.ok(!out.html.includes('data:image/'), 'no data-uri leaked in sibling-folder mode');
		assert.ok(Array.isArray(out.assets), 'assets should be array');
		assert.strictEqual(out.assets!.length, 2);
		const rels = out.assets!.map(a => a.relativePath).sort();
		assert.deepStrictEqual(rels, ['note_files/one.png', 'note_files/two.jpg']);
		const byRel = new Map(out.assets!.map(a => [a.relativePath, a.base64] as const));
		assert.strictEqual(byRel.get('note_files/one.png'), 'AAAAB');
		assert.strictEqual(byRel.get('note_files/two.jpg'), 'CCCCD');
	});

	test('未命中 map 的 <img> 保留原始 src', () => {
		const out = assembleExportHtml({
			...baseInput,
			bodyInnerHtml: '<p><img src="https://example.com/x.png"><img src="./pic/one.png"></p>',
			imageMode: 'data-uri',
			imageResources: resources,
		});
		// 外链保留
		assert.ok(out.html.includes('src="https://example.com/x.png"'), 'external URL should stay');
		// 命中的换成 data-uri
		assert.ok(out.html.includes('src="data:image/png;base64,AAAAB"'));
	});

	test('rewriteImageSources · sibling-folder 冲突文件名走 -1 后缀', () => {
		const res = makeResources([
			['./a/img.png', { originalSrc: './a/img.png', mime: 'image/png', base64: 'X1' }],
			['./b/img.png', { originalSrc: './b/img.png', mime: 'image/png', base64: 'X2' }],
		]);
		const { html, assets } = rewriteImageSources({
			bodyHtml: '<img src="./a/img.png"><img src="./b/img.png">',
			imageMode: 'sibling-folder',
			imageResources: res,
			siblingFolder: 'doc_files',
		});
		const rels = assets.map(a => a.relativePath);
		assert.deepStrictEqual(rels, ['doc_files/img.png', 'doc_files/img-1.png']);
		assert.ok(html.includes('src="doc_files/img.png"'));
		assert.ok(html.includes('src="doc_files/img-1.png"'));
	});

	test('rewriteImageSources · 空 map / 无 img 时 assets 为空数组', () => {
		const out1 = rewriteImageSources({
			bodyHtml: '<p>no img here</p>',
			imageMode: 'data-uri',
			imageResources: makeResources([]),
			siblingFolder: 'x_files',
		});
		assert.strictEqual(out1.assets.length, 0);
		assert.strictEqual(out1.html, '<p>no img here</p>');

		const out2 = rewriteImageSources({
			bodyHtml: '<p>no img</p>',
			imageMode: 'sibling-folder',
			imageResources: undefined,
			siblingFolder: 'x_files',
		});
		assert.strictEqual(out2.assets.length, 0);
	});
});
