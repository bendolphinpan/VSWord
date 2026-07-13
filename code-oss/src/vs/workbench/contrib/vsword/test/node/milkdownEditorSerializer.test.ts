/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Milkdown 页签会话序列化契约测试。
 * 保证 serialize 写出 resourceJSON；反序列化路径能 revive URI。
 * （完整 createEditorInput 需要 DI/webview，此处只覆盖 JSON 契约与 canSerialize 守卫。）
 */

import * as assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { MilkdownEditorInputSerializer } from '../../browser/milkdownEditor/milkdownEditorInputSerializer.js';
import { MilkdownEditorInput } from '../../browser/milkdownEditor/milkdownEditorInput.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';

suite('MilkdownEditorInputSerializer · 会话恢复契约', () => {

	test('canSerialize · 非 MilkdownEditorInput → false', () => {
		const serializer = new MilkdownEditorInputSerializer();
		const fake = { typeId: 'other' } as unknown as EditorInput;
		assert.strictEqual(serializer.canSerialize(fake), false);
	});

	test('serialize · 写出 resourceJSON；deserialize 能 revive 同一路径', () => {
		const serializer = new MilkdownEditorInputSerializer();
		const resource = URI.file('D:/notes/demo.md');
		// 最小 stub：只提供 instanceof 与 resource（serialize 只读这两处）
		const input = Object.create(MilkdownEditorInput.prototype) as MilkdownEditorInput;
		Object.defineProperty(input, 'resource', { get: () => resource });

		assert.strictEqual(serializer.canSerialize(input), true);
		const raw = serializer.serialize(input);
		assert.ok(typeof raw === 'string' && raw.length > 0, '应产出 JSON 字符串');

		const parsed = JSON.parse(raw!);
		assert.ok(parsed.resourceJSON, 'payload 含 resourceJSON');
		const revived = URI.revive(parsed.resourceJSON);
		assert.strictEqual(revived.scheme, 'file');
		assert.ok(revived.fsPath.replace(/\\/g, '/').toLowerCase().endsWith('/notes/demo.md')
			|| revived.path.toLowerCase().endsWith('/notes/demo.md'),
			`路径应恢复为 demo.md，got ${revived.toString()}`);
	});

	test('deserialize · 坏 JSON → undefined（不抛）', () => {
		const serializer = new MilkdownEditorInputSerializer();
		// deserialize 需要 IInstantiationService；坏 JSON 在 parse 阶段就 return undefined
		const result = serializer.deserialize(
			{ invokeFunction: () => { throw new Error('should not reach'); } } as any,
			'{not-json',
		);
		assert.strictEqual(result, undefined);
	});
});
