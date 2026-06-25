/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { countWords, parseFrontmatter } from '../../common/vswordDocumentUtils.js';

suite('VSWord Markdown document utils', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses YAML frontmatter known fields while preserving unknown fields', () => {
		const markdown = [
			'---',
			'title: "Project Plan"',
			'tags: [writing, roadmap]',
			'aliases:',
			'  - Plan A',
			'  - Draft Plan',
			'status: draft',
			'customField: keep me',
			'---',
			'# Project Plan',
			'',
			'正文 body',
		].join('\n');

		const parsed = parseFrontmatter(markdown);

		assert.strictEqual(parsed.hasFrontmatter, true);
		assert.strictEqual(parsed.body, '# Project Plan\n\n正文 body');
		assert.strictEqual(parsed.known.title, 'Project Plan');
		assert.deepStrictEqual(parsed.known.tags, ['writing', 'roadmap']);
		assert.deepStrictEqual(parsed.known.aliases, ['Plan A', 'Draft Plan']);
		assert.strictEqual(parsed.known.status, 'draft');
		assert.deepStrictEqual(parsed.unknown, { customField: 'keep me' });
		assert.strictEqual(parsed.parseError, undefined);
	});

	test('treats unclosed frontmatter fence as normal body text', () => {
		const markdown = '---\ntitle: Broken\n# Still body';
		const parsed = parseFrontmatter(markdown);

		assert.strictEqual(parsed.hasFrontmatter, false);
		assert.strictEqual(parsed.frontmatter, null);
		assert.strictEqual(parsed.body, markdown);
		assert.deepStrictEqual(parsed.known, {});
		assert.deepStrictEqual(parsed.unknown, {});
	});

	test('word count ignores frontmatter body split result', () => {
		const parsed = parseFrontmatter('---\ntitle: Ignore Me\n---\nHello 世界');
		const count = countWords(parsed.body);

		assert.strictEqual(count.words, 3);
	});
});
