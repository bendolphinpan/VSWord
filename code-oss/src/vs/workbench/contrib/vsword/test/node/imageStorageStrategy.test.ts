/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	VSWORD_IMAGE_STRATEGIES,
	VSWORD_IMAGE_STRATEGY_CONFIG,
	VSWORD_IMAGE_STRATEGY_DEFAULT,
	isValidImageStrategy,
	resolveImageLocation,
	resolveRelativeDirSegments,
	resolveUniqueFileName,
	sanitizeImageFileName,
} from '../../browser/milkdownEditor/imageStorageStrategy.js';

/**
 * Tiny helper: build a `fileExists` predicate that reports `true` for the
 * listed filenames and `false` for anything else. Mirrors the shape the
 * contribution passes into `resolveImageLocation` (a closure over a dir URI).
 */
function existsIn(existing: readonly string[]): (name: string) => Promise<boolean> {
	const set = new Set(existing);
	return async name => set.has(name);
}

suite('VSWord T-3.5.1 image storage strategy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('strategy constants + config key are stable public contract', () => {
		assert.deepStrictEqual([...VSWORD_IMAGE_STRATEGIES], ['assets-shared', 'assets-per-file', 'same-folder']);
		assert.strictEqual(VSWORD_IMAGE_STRATEGY_DEFAULT, 'assets-shared');
		assert.strictEqual(VSWORD_IMAGE_STRATEGY_CONFIG, 'vsword.markdown.imageStorageStrategy');
	});

	test('isValidImageStrategy accepts known ids only', () => {
		assert.strictEqual(isValidImageStrategy('assets-shared'), true);
		assert.strictEqual(isValidImageStrategy('assets-per-file'), true);
		assert.strictEqual(isValidImageStrategy('same-folder'), true);
		assert.strictEqual(isValidImageStrategy('assets'), false);
		assert.strictEqual(isValidImageStrategy(''), false);
		assert.strictEqual(isValidImageStrategy(null), false);
		assert.strictEqual(isValidImageStrategy(undefined), false);
		assert.strictEqual(isValidImageStrategy(42), false);
	});

	test('resolveRelativeDirSegments maps each strategy to its Typora-style folder', () => {
		assert.deepStrictEqual(resolveRelativeDirSegments('assets-shared', 'foo'), ['assets']);
		assert.deepStrictEqual(resolveRelativeDirSegments('assets-per-file', 'foo'), ['foo.assets']);
		assert.deepStrictEqual(resolveRelativeDirSegments('same-folder', 'foo'), []);
	});

	test('assets-per-file preserves CJK/spaces safely in the folder name', () => {
		// CJK preserved, spaces collapsed to '-', extension-illegal chars stripped.
		assert.deepStrictEqual(resolveRelativeDirSegments('assets-per-file', '中文 文档'), ['中文-文档.assets']);
		assert.deepStrictEqual(resolveRelativeDirSegments('assets-per-file', ''), ['image.assets']);
		assert.deepStrictEqual(resolveRelativeDirSegments('assets-per-file', '???!!!'), ['image.assets']);
	});

	test('sanitizeImageFileName strips unsafe chars, keeps CJK, and picks ext from mime when missing', () => {
		assert.deepStrictEqual(sanitizeImageFileName('screenshot.png', 'image/png'), { base: 'screenshot', ext: 'png' });
		assert.deepStrictEqual(sanitizeImageFileName('pasted image.PNG', 'image/png'), { base: 'pasted-image', ext: 'png' });
		// Mime overrides missing extension.
		assert.deepStrictEqual(sanitizeImageFileName('nopic', 'image/jpeg'), { base: 'nopic', ext: 'jpg' });
		// Empty stem falls back to 'image', empty mime falls back to 'png'.
		assert.deepStrictEqual(sanitizeImageFileName('', ''), { base: 'image', ext: 'png' });
		// CJK is kept intact.
		assert.deepStrictEqual(sanitizeImageFileName('截图.png', 'image/png'), { base: '截图', ext: 'png' });
	});

	test('resolveUniqueFileName returns the first candidate when free', async () => {
		const name = await resolveUniqueFileName('pic', 'png', ['assets'], existsIn([]));
		assert.strictEqual(name, 'pic.png');
	});

	test('resolveUniqueFileName appends -1, -2, ... on collisions (Typora style)', async () => {
		const first = await resolveUniqueFileName('pic', 'png', ['assets'], existsIn(['pic.png']));
		assert.strictEqual(first, 'pic-1.png');

		const second = await resolveUniqueFileName('pic', 'png', ['assets'], existsIn(['pic.png', 'pic-1.png']));
		assert.strictEqual(second, 'pic-2.png');

		const gap = await resolveUniqueFileName('pic', 'png', ['assets'], existsIn(['pic.png', 'pic-1.png', 'pic-2.png', 'pic-3.png']));
		assert.strictEqual(gap, 'pic-4.png');
	});

	test('resolveImageLocation end-to-end for assets-shared strategy', async () => {
		const location = await resolveImageLocation('assets-shared', 'my-doc', 'photo.png', 'image/png', existsIn([]));
		assert.deepStrictEqual([...location.relativeDirSegments], ['assets']);
		assert.strictEqual(location.fileName, 'photo.png');
		assert.strictEqual(location.markdownPath, 'assets/photo.png');
	});

	test('resolveImageLocation end-to-end for assets-per-file with a collision', async () => {
		const location = await resolveImageLocation(
			'assets-per-file',
			'notes',
			'diagram.png',
			'image/png',
			existsIn(['diagram.png']),
		);
		assert.deepStrictEqual([...location.relativeDirSegments], ['notes.assets']);
		assert.strictEqual(location.fileName, 'diagram-1.png');
		assert.strictEqual(location.markdownPath, 'notes.assets/diagram-1.png');
	});

	test('resolveImageLocation end-to-end for same-folder with no subdir', async () => {
		const location = await resolveImageLocation('same-folder', 'doc', 'shot.jpg', 'image/jpeg', existsIn([]));
		assert.deepStrictEqual([...location.relativeDirSegments], []);
		assert.strictEqual(location.fileName, 'shot.jpg');
		assert.strictEqual(location.markdownPath, 'shot.jpg');
	});

	test('resolveImageLocation falls back to image.png when suggested name is unusable', async () => {
		const location = await resolveImageLocation('assets-shared', 'doc', '', '', existsIn([]));
		assert.strictEqual(location.fileName, 'image.png');
		assert.strictEqual(location.markdownPath, 'assets/image.png');
	});

	test('resolveImageLocation collision chain works across many attempts', async () => {
		// Simulate 5 existing dedup slots — should pick -5.
		const existing = ['pic.png', 'pic-1.png', 'pic-2.png', 'pic-3.png', 'pic-4.png'];
		const location = await resolveImageLocation('assets-shared', 'doc', 'pic.png', 'image/png', existsIn(existing));
		assert.strictEqual(location.fileName, 'pic-5.png');
		assert.strictEqual(location.markdownPath, 'assets/pic-5.png');
	});
});
