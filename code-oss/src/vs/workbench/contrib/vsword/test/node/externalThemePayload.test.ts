/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7d.2.c · 外挂主题 payload 组装层最小回归。
//
// buildExternalThemePayload 是把 b 卡两个纯函数 + fileService 读文件 + webview-uri 变换
// 拼在一起的薄薄组合层，是 Contribution 类唯一的 async side effect。这里锁死 5 条断言：
//
//   P1 · 非 ext:* id 直接返回 undefined（不查 themes、不读文件）
//   P2 · themes 里查不到 id 返回 undefined
//   P3 · 端到端：ext:workspace:whitey → cssText 里同时含 rebase 后的 url + `body[data-theme=...]` scope
//   P4 · fileService.readFile 抛错 → 静默降级返回 undefined（不上抛）
//   P5 · toWebviewUri 被真实调用（用 spy 校验参数是主题所在目录，不是主题文件本身）
//
// runner：`code-oss/test/scripts/run-external-theme-payload-test.mjs`（与其他 3 个 runner 同构）。

import * as assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import type { IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import type { ExternalTheme } from '../../browser/milkdownEditor/milkdownEditorExternalThemes.js';
import { buildExternalThemePayload } from '../../browser/milkdownEditor/milkdownEditorExternalThemePayload.js';

// ---------- helpers ----------

function makeFakeFileService(files: Record<string, string | Error>): Pick<IFileService, 'readFile'> {
	return {
		async readFile(resource: URI): Promise<IFileContent> {
			const key = resource.toString();
			const rec = files[key];
			if (rec === undefined) {
				throw new Error(`fake readFile: no fixture for ${key}`);
			}
			if (rec instanceof Error) {
				throw rec;
			}
			// 只塞 buildExternalThemePayload 里真正读到的字段：`value`。
			// 其余 IFileStat 字段与本层无关，用 unknown cast 免掉整套 IBaseFileStatWithMetadata。
			return { value: VSBuffer.fromString(rec) } as unknown as IFileContent;
		},
	};
}

const WHITEY_URI = URI.parse('vsword-test://workspace/.vsword/themes/whitey.css');
const WHITEY_DIR = URI.parse('vsword-test://workspace/.vsword/themes');
const WHITEY_CSS =
	'@font-face { src: url(./fonts/foo.woff2); }\nbody { color: #333; }';

const WHITEY_THEME: ExternalTheme = {
	id: 'ext:workspace:whitey',
	source: 'workspace',
	displayName: 'whitey',
	uri: WHITEY_URI,
};

suite('T-3.7d.2.c · 外挂主题 payload 组装 · 最小回归', () => {

	test('P1 · 非 ext:* id 直接返回 undefined（不查 themes / 不读文件）', async () => {
		let readCalls = 0;
		const fake: Pick<IFileService, 'readFile'> = {
			async readFile(): Promise<IFileContent> {
				readCalls++;
				throw new Error('should not be called');
			},
		};
		const payload = await buildExternalThemePayload({
			themeId: 'github',
			themes: [WHITEY_THEME],
			fileService: fake,
			toWebviewUri: uri => uri,
		});
		assert.strictEqual(payload, undefined, '内置主题 id 不应产出 payload');
		assert.strictEqual(readCalls, 0, '非 ext:* id 不应触发 readFile');
	});

	test('P2 · themes 里查不到 id → 返回 undefined', async () => {
		const fake = makeFakeFileService({});
		const payload = await buildExternalThemePayload({
			themeId: 'ext:workspace:no-such-theme',
			themes: [WHITEY_THEME],
			fileService: fake,
			toWebviewUri: uri => uri,
		});
		assert.strictEqual(payload, undefined);
	});

	test('P3 · 端到端：cssText 含 rebase 后 url + body[data-theme=<id>] scope', async () => {
		const fake = makeFakeFileService({
			[WHITEY_URI.toString()]: WHITEY_CSS,
		});
		const payload = await buildExternalThemePayload({
			themeId: 'ext:workspace:whitey',
			themes: [WHITEY_THEME],
			fileService: fake,
			toWebviewUri: uri => uri,
		});
		assert.ok(payload, 'payload 应产出');
		assert.strictEqual(payload!.type, 'themeCssPayload');
		assert.strictEqual(payload!.themeId, 'ext:workspace:whitey');
		const css = payload!.cssText;
		// rebase：`./fonts/foo.woff2` → `<WHITEY_DIR>/fonts/foo.woff2`
		assert.ok(
			css.includes(WHITEY_DIR.toString() + '/fonts/foo.woff2'),
			`期望 cssText 含 rebase 后 URL，实际=${css}`,
		);
		assert.ok(!css.includes('./fonts/foo.woff2'), '不应残留 ./ 前缀');
		// scope：外层 body[data-theme="<id>"]
		assert.ok(
			css.includes('body[data-theme="ext:workspace:whitey"]'),
			`期望 cssText 含 scope 选择器，实际=${css}`,
		);
	});

	test('P4 · fileService.readFile 抛错 → 静默降级返回 undefined', async () => {
		const fake = makeFakeFileService({
			[WHITEY_URI.toString()]: new Error('disk gremlin'),
		});
		const payload = await buildExternalThemePayload({
			themeId: 'ext:workspace:whitey',
			themes: [WHITEY_THEME],
			fileService: fake,
			toWebviewUri: uri => uri,
		});
		assert.strictEqual(payload, undefined, 'IO 抛错应就地吞掉，不上抛');
	});

	test('P5 · toWebviewUri 收到的是主题所在目录 URI（不是主题文件 URI）', async () => {
		const fake = makeFakeFileService({
			[WHITEY_URI.toString()]: 'body { color: red }',
		});
		const seen: URI[] = [];
		const payload = await buildExternalThemePayload({
			themeId: 'ext:workspace:whitey',
			themes: [WHITEY_THEME],
			fileService: fake,
			toWebviewUri: uri => {
				seen.push(uri);
				// 模拟 asWebviewUri：换 scheme 触发 rebase 走真实变换路径
				return URI.parse('https://webview.local' + uri.path);
			},
		});
		assert.ok(payload, 'payload 应产出');
		assert.strictEqual(seen.length, 1, 'toWebviewUri 只应被调用一次');
		assert.strictEqual(seen[0].toString(), WHITEY_DIR.toString(),
			`toWebviewUri 参数应是主题目录，实际=${seen[0].toString()}`);
	});

});
