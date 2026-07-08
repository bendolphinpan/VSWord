/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7d.2.b · 外挂主题 discovery 层最小回归。
//
// 断言集合（按 PRD §4.2 + AC-2/4/5/6）：
//   D1 · workspace + user 双缺 → 返回 []（静默降级，不抛）
//   D2 · workspace 有 whitey.css → 1 条 `ext:workspace:whitey`，displayName 保留大小写
//   D3 · workspace 和 user 同名 github.css → 1 条 workspace 版本（覆盖 user）
//   D4 · 只 user 有 github.css → 1 条 `ext:user:github`
//   D5 · user 目录里 .txt / 子目录都忽略；只留顶层 .css
//   D6 · extractThemeDisplayName：命中头注释 `Theme Name: My Theme` 返回 `My Theme`；不命中返回 undefined
//   D7 · fileService 抛非 FileNotFound/NotADirectory 错误 → 原样上抛，不吞
//
// runner：`code-oss/test/scripts/run-external-theme-discovery-test.mjs`（与 run-external-themes-test.mjs 同构）。

import * as assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { joinPath } from '../../../../../base/common/resources.js';
import {
	createFileSystemProviderError,
	FileSystemProviderErrorCode,
	IFileService,
	IFileStat,
} from '../../../../../platform/files/common/files.js';
import {
	discoverExternalThemes,
	extractThemeDisplayName,
} from '../../browser/milkdownEditor/milkdownEditorExternalThemeDiscovery.js';

// ---------- fake IFileService ----------
//
// 只覆盖 discoverExternalThemes 用到的 API：`resolve(uri)`。其余方法全部抛 not-implemented，
// 一旦 discovery 层未来偷偷加了别的 fileService 调用，测试会立刻炸出来。

interface FakeEntry {
	readonly name: string;
	readonly isDirectory: boolean;
}

/** 每条目录记录：key = URI.toString()，value = children 列表 | 'not-found' | 错误码。 */
type DirRecord = readonly FakeEntry[] | 'not-found' | 'not-a-directory' | Error;

function makeFakeFileService(dirs: Record<string, DirRecord>): IFileService {
	const fake = {
		async resolve(resource: URI): Promise<IFileStat> {
			const key = resource.toString();
			const rec = dirs[key];
			if (rec === undefined || rec === 'not-found') {
				throw createFileSystemProviderError(
					`fake: ${key} not found`,
					FileSystemProviderErrorCode.FileNotFound,
				);
			}
			if (rec === 'not-a-directory') {
				throw createFileSystemProviderError(
					`fake: ${key} not a directory`,
					FileSystemProviderErrorCode.FileNotADirectory,
				);
			}
			if (rec instanceof Error) {
				throw rec;
			}
			const children: IFileStat[] = rec.map(entry => ({
				resource: joinPath(resource, entry.name),
				name: entry.name,
				isFile: !entry.isDirectory,
				isDirectory: entry.isDirectory,
				isSymbolicLink: false,
				children: undefined,
			}));
			return {
				resource,
				name: resource.path.split('/').pop() ?? '',
				isFile: false,
				isDirectory: true,
				isSymbolicLink: false,
				children,
			};
		},
	};
	// discovery 层只调 fileService.resolve —— 其他 API 保留为 undefined，Type 断言窄化到 IFileService。
	return fake as unknown as IFileService;
}

// ---------- 测试脚手架 ----------

const WORKSPACE = URI.parse('vsword-test://host/workspace');
const USER_HOME = URI.parse('vsword-test://host/user');

function themeDirUri(root: URI): string {
	return joinPath(root, '.vsword/themes').toString();
}

// ---------- 断言 ----------

suite('T-3.7d.2.b · 外挂主题 discovery · 纯函数层最小回归', () => {

	test('D1 · workspace + user 目录都不存在时返回空数组，不抛', async () => {
		const fs = makeFakeFileService({});
		const themes = await discoverExternalThemes({
			fileService: fs,
			workspaceUri: WORKSPACE,
			userConfigDirUri: USER_HOME,
		});
		assert.deepStrictEqual(themes, []);
	});

	test('D2 · workspace 有 whitey.css → 1 条 ext:workspace:whitey，displayName 保留大小写', async () => {
		const wsThemesUri = themeDirUri(WORKSPACE);
		const fs = makeFakeFileService({
			[wsThemesUri]: [{ name: 'Whitey.css', isDirectory: false }],
			[themeDirUri(USER_HOME)]: 'not-found',
		});
		const themes = await discoverExternalThemes({
			fileService: fs,
			workspaceUri: WORKSPACE,
			userConfigDirUri: USER_HOME,
		});
		assert.strictEqual(themes.length, 1);
		const [theme] = themes;
		assert.strictEqual(theme.id, 'ext:workspace:whitey');
		assert.strictEqual(theme.source, 'workspace');
		assert.strictEqual(theme.displayName, 'Whitey', 'displayName 从 basename 去 .css 后取，保留大小写');
		assert.ok(theme.uri.toString().endsWith('/Whitey.css'), `uri 应指向具体文件，实际=${theme.uri.toString()}`);
	});

	test('D3 · workspace 和 user 同名 github.css → 返回 workspace 版本，覆盖 user', async () => {
		const fs = makeFakeFileService({
			[themeDirUri(WORKSPACE)]: [{ name: 'github.css', isDirectory: false }],
			[themeDirUri(USER_HOME)]: [{ name: 'github.css', isDirectory: false }],
		});
		const themes = await discoverExternalThemes({
			fileService: fs,
			workspaceUri: WORKSPACE,
			userConfigDirUri: USER_HOME,
		});
		assert.strictEqual(themes.length, 1, `同 slug 应去重，实际=${themes.length}`);
		assert.strictEqual(themes[0].id, 'ext:workspace:github');
		assert.strictEqual(themes[0].source, 'workspace');
	});

	test('D4 · 只 user 有 github.css → 1 条 ext:user:github', async () => {
		const fs = makeFakeFileService({
			[themeDirUri(WORKSPACE)]: 'not-found',
			[themeDirUri(USER_HOME)]: [{ name: 'github.css', isDirectory: false }],
		});
		const themes = await discoverExternalThemes({
			fileService: fs,
			workspaceUri: WORKSPACE,
			userConfigDirUri: USER_HOME,
		});
		assert.strictEqual(themes.length, 1);
		assert.strictEqual(themes[0].id, 'ext:user:github');
		assert.strictEqual(themes[0].source, 'user');
	});

	test('D5 · .txt / 子目录忽略；只留顶层 .css', async () => {
		const fs = makeFakeFileService({
			[themeDirUri(WORKSPACE)]: 'not-found',
			[themeDirUri(USER_HOME)]: [
				{ name: 'notes.txt', isDirectory: false },
				{ name: 'sub', isDirectory: true },
				{ name: 'valid.css', isDirectory: false },
				{ name: 'README.md', isDirectory: false },
			],
		});
		const themes = await discoverExternalThemes({
			fileService: fs,
			workspaceUri: WORKSPACE,
			userConfigDirUri: USER_HOME,
		});
		assert.strictEqual(themes.length, 1, `只应留 valid.css，实际=${themes.length}`);
		assert.strictEqual(themes[0].id, 'ext:user:valid');
	});

	test('D6 · extractThemeDisplayName 命中头注释 / 命中不到都能正确处理', () => {
		const hit = extractThemeDisplayName('/* Theme Name: My Theme */\nbody { color: red; }');
		assert.strictEqual(hit, 'My Theme');

		const hitLowercase = extractThemeDisplayName('/* theme name: mixed Case Value */');
		assert.strictEqual(hitLowercase, 'mixed Case Value', '关键字大小写不敏感，值保留原始大小写');

		const missNoBlockComment = extractThemeDisplayName('body { color: red }');
		assert.strictEqual(missNoBlockComment, undefined);

		const missBlockButNoKey = extractThemeDisplayName('/* just a comment */\nbody {}');
		assert.strictEqual(missBlockButNoKey, undefined);

		const emptyValue = extractThemeDisplayName('/* Theme Name: */\nbody {}');
		assert.strictEqual(emptyValue, undefined, '空值兜底为 undefined，让 caller 用 basename');
	});

	test('D7 · fileService 抛非 FileNotFound/NotADirectory 错误时上抛，不吞', async () => {
		const fs = makeFakeFileService({
			[themeDirUri(WORKSPACE)]: createFileSystemProviderError(
				'permission denied',
				FileSystemProviderErrorCode.NoPermissions,
			),
			[themeDirUri(USER_HOME)]: 'not-found',
		});
		let caught: unknown;
		try {
			await discoverExternalThemes({
				fileService: fs,
				workspaceUri: WORKSPACE,
				userConfigDirUri: USER_HOME,
			});
		} catch (err) {
			caught = err;
		}
		assert.ok(caught instanceof Error, `期望抛错，实际=${caught}`);
		assert.ok(
			(caught as Error).message.includes('permission denied'),
			`应保留原错误信息，实际=${(caught as Error).message}`,
		);
	});
});
