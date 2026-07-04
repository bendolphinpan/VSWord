/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5b.2 — mermaid view helper unit tests (pure functions, no DOM / mermaid).

import * as assert from 'assert';
import {
	getCodeBlockSource,
	buildThemedSource,
	extractMermaidError,
	mermaidIsEmpty,
	autoSizeTextareaPx,
	normalizeMermaidSource,
} from '../../browser/milkdownEditor/webview/mermaid-view-helpers.template.js';

suite('T-3.5b.2 · getCodeBlockSource', () => {
	test('returns textContent from PM-like node', () => {
		assert.strictEqual(getCodeBlockSource({ textContent: 'graph LR\n  A --> B' } as any), 'graph LR\n  A --> B');
	});

	test('null / undefined / missing textContent → empty', () => {
		assert.strictEqual(getCodeBlockSource(null as any), '');
		assert.strictEqual(getCodeBlockSource(undefined as any), '');
		assert.strictEqual(getCodeBlockSource({} as any), '');
	});

	test('non-string textContent → empty', () => {
		assert.strictEqual(getCodeBlockSource({ textContent: 42 } as any), '');
	});
});

suite('T-3.5b.2 · buildThemedSource', () => {
	test('prepends init frontmatter with dark theme when isDark=true', () => {
		const out = buildThemedSource('graph LR\n  A --> B', true);
		assert.match(out, /^%%\{init:\{'theme':'dark'\}\}%%/);
		assert.ok(out.endsWith('graph LR\n  A --> B'));
	});

	test('prepends init frontmatter with default theme when isDark=false', () => {
		const out = buildThemedSource('graph LR\n  A --> B', false);
		assert.match(out, /^%%\{init:\{'theme':'default'\}\}%%/);
	});

	test('respects user-provided %%{init:...}%% frontmatter and does NOT wrap', () => {
		const userSrc = `%%{init:{'theme':'forest'}}%%\ngraph LR\n  A --> B`;
		assert.strictEqual(buildThemedSource(userSrc, true), userSrc);
		assert.strictEqual(buildThemedSource(userSrc, false), userSrc);
	});

	test('leading whitespace before user init is tolerated', () => {
		const userSrc = `   %%{init:{'securityLevel':'strict'}}%%\ngraph LR`;
		assert.strictEqual(buildThemedSource(userSrc, true), userSrc);
	});

	test('null / undefined source → still produces valid themed empty frame', () => {
		const out = buildThemedSource(null, false);
		assert.match(out, /^%%\{init:\{'theme':'default'\}\}%%\n$/);
	});
});

suite('T-3.5b.2 · extractMermaidError', () => {
	test('reads err.hash.text + line (1-based) when present', () => {
		const err = { hash: { line: 2, text: "Parse error on line 3: Expected 'CLASS_DIAGRAM'" } };
		const msg = extractMermaidError(err);
		assert.ok(msg && msg.includes('行 3'));
		assert.ok(msg && msg.includes('Expected'));
	});

	test('falls back to err.hash.token when text missing', () => {
		const err = { hash: { line: 0, token: 'GRAPH' } };
		const msg = extractMermaidError(err);
		assert.ok(msg && msg.includes('GRAPH'));
	});

	test('falls back to Error.message on plain Error', () => {
		const err = new Error('Something broke');
		assert.strictEqual(extractMermaidError(err), 'Something broke');
	});

	test('null / undefined / non-object → null', () => {
		assert.strictEqual(extractMermaidError(null), null);
		assert.strictEqual(extractMermaidError(undefined), null);
		assert.strictEqual(extractMermaidError('string' as any), null);
	});

	test('strips leading "Error: " prefix and truncates to first line', () => {
		const err = new Error('Error: Bad diagram\nline 2\nline 3');
		const msg = extractMermaidError(err);
		assert.strictEqual(msg, 'Bad diagram');
	});
});

suite('T-3.5b.2 · mermaidIsEmpty', () => {
	test('true for null / undefined / "" / whitespace', () => {
		assert.strictEqual(mermaidIsEmpty(null), true);
		assert.strictEqual(mermaidIsEmpty(undefined), true);
		assert.strictEqual(mermaidIsEmpty(''), true);
		assert.strictEqual(mermaidIsEmpty('   \n\t'), true);
	});

	test('false for any visible content', () => {
		assert.strictEqual(mermaidIsEmpty('graph LR'), false);
		assert.strictEqual(mermaidIsEmpty('   A --> B   '), false);
	});
});

suite('T-3.5b.2 · autoSizeTextareaPx', () => {
	test('single line → min height (96)', () => {
		assert.strictEqual(autoSizeTextareaPx('x'), 96);
		assert.strictEqual(autoSizeTextareaPx(''), 96);
	});

	test('multi-line grows linearly', () => {
		const two = autoSizeTextareaPx('a\nb');
		const ten = autoSizeTextareaPx('a\n'.repeat(10));
		assert.ok(ten > two);
	});

	test('caps at max (480 default)', () => {
		const huge = 'x\n'.repeat(500);
		assert.strictEqual(autoSizeTextareaPx(huge), 480);
	});

	test('custom bounds respected', () => {
		assert.strictEqual(autoSizeTextareaPx('x', { minPx: 40, maxPx: 200 }), 40);
		assert.strictEqual(autoSizeTextareaPx('x\n'.repeat(30), { minPx: 40, maxPx: 200 }), 200);
	});
});

suite('T-3.5b.2 · normalizeMermaidSource', () => {
	test('strips trailing blank lines but preserves internal', () => {
		assert.strictEqual(normalizeMermaidSource('graph LR\n  A --> B\n\n\n'), 'graph LR\n  A --> B');
	});

	test('preserves leading indentation and empty inner lines', () => {
		assert.strictEqual(
			normalizeMermaidSource('  graph LR\n\n  A --> B'),
			'  graph LR\n\n  A --> B',
		);
	});

	test('null / undefined → empty', () => {
		assert.strictEqual(normalizeMermaidSource(null as any), '');
		assert.strictEqual(normalizeMermaidSource(undefined as any), '');
	});

	test('handles CRLF trailing whitespace', () => {
		assert.strictEqual(normalizeMermaidSource('A --> B\r\n\r\n'), 'A --> B');
	});
});
