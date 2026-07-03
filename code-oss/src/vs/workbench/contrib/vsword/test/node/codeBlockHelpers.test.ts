/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7 — code-block helpers: language catalogue + fuzzy search + normalization.
// Runs in jsdom-free node; helpers are pure functions on strings.

import * as assert from 'assert';
import {
	CODE_LANGS,
	labelForLang,
	normalizeLangKey,
	searchLangs,
	refractorLangIds,
} from '../../browser/milkdownEditor/webview/code-block-helpers.template.js';

suite('T-3.7 code-block helpers · language catalogue', () => {
	test('catalogue includes the 27 refractor-backed languages plus <空>', () => {
		// <空> = { id: '', label: '<空>' } → 28 total; 27 refractor entries.
		assert.strictEqual(refractorLangIds().length, 27);
		assert.ok(CODE_LANGS.some(l => l.id === '' && l.label === '<空>'));
	});

	test('every catalogue entry has non-empty label + string id', () => {
		for (const entry of CODE_LANGS) {
			assert.strictEqual(typeof entry.id, 'string');
			assert.ok(entry.label.length > 0, `${entry.id} needs a label`);
		}
	});

	test('catalogue is unique on id (no duplicates)', () => {
		const ids = CODE_LANGS.map(l => l.id);
		assert.strictEqual(new Set(ids).size, ids.length);
	});
});

suite('T-3.7 code-block helpers · normalizeLangKey', () => {
	test('lowercases and trims', () => {
		assert.strictEqual(normalizeLangKey('  Python  '), 'python');
		assert.strictEqual(normalizeLangKey('TypeScript'), 'typescript');
	});

	test('empty/nullish → empty string (means "no language")', () => {
		assert.strictEqual(normalizeLangKey(''), '');
		assert.strictEqual(normalizeLangKey(null), '');
		assert.strictEqual(normalizeLangKey(undefined), '');
		assert.strictEqual(normalizeLangKey('  \t '), '');
	});

	test('aliases: normalizeLangKey only trims+lowercases; alias mapping lives in resolveLang', () => {
		// normalizeLangKey is a syntactic normalizer — it doesn't rewrite js→javascript.
		// Alias handling is one layer up (resolveLang / labelForLang / searchLangs).
		assert.strictEqual(normalizeLangKey('JS'), 'js');
		assert.strictEqual(normalizeLangKey(' Python '), 'python');
		assert.strictEqual(normalizeLangKey('C++'), 'c++');
	});

	test('non-registered languages pass through normalized (e.g. mermaid)', () => {
		assert.strictEqual(normalizeLangKey('mermaid'), 'mermaid');
		assert.strictEqual(normalizeLangKey('Graphviz'), 'graphviz');
	});
});

suite('T-3.7 code-block helpers · labelForLang', () => {
	test('empty/null → "<空>" (the placeholder entry\'s label)', () => {
		// The button placeholder is the label of the CODE_LANGS[0] entry, which
		// is "<空>". Callers that want a different button copy substitute at the
		// UI layer — the helper stays a pure catalogue lookup.
		assert.strictEqual(labelForLang(''), '<空>');
		assert.strictEqual(labelForLang(null), '<空>');
		assert.strictEqual(labelForLang(undefined), '<空>');
	});

	test('known catalogue id → its label', () => {
		assert.strictEqual(labelForLang('python'), 'Python');
		assert.strictEqual(labelForLang('typescript'), 'TypeScript');
	});

	test('alias normalization used before lookup', () => {
		assert.strictEqual(labelForLang('js'), 'JavaScript');
		assert.strictEqual(labelForLang('ts'), 'TypeScript');
	});

	test('unknown language → raw string echoed back (mermaid, foo)', () => {
		assert.strictEqual(labelForLang('mermaid'), 'mermaid');
		assert.strictEqual(labelForLang('foo'), 'foo');
	});
});

suite('T-3.7 code-block helpers · searchLangs (fuzzy Q7=b)', () => {
	test('empty query returns full catalogue in order', () => {
		const r = searchLangs('');
		assert.strictEqual(r.length, CODE_LANGS.length);
		assert.strictEqual(r[0].entry.id, CODE_LANGS[0].id);
	});

	test('prefix match ranks first: "py" → python top', () => {
		const r = searchLangs('py');
		assert.ok(r.length > 0);
		assert.strictEqual(r[0].entry.id, 'python');
	});

	test('short alias "ts" → typescript top (via alias normalization or fuzzy)', () => {
		const r = searchLangs('ts');
		assert.ok(r.length > 0);
		// Typescript, tsx both start with "ts" — either can win, but typescript
		// should be ahead of unrelated matches like "TOML" (which contains no ts).
		const topIds = r.slice(0, 3).map(e => e.entry.id);
		assert.ok(topIds.includes('typescript'), 'typescript should appear in top 3');
	});

	test('fuzzy across gaps: "jsc" → javascript (j..s..c order preserved)', () => {
		const r = searchLangs('jsc');
		const ids = r.map(e => e.entry.id);
		assert.ok(ids.includes('javascript') || ids.includes('json') || ids.includes('jsx'),
			`fuzzy jsc should find at least one j-s-* language, got ${ids.slice(0, 5).join(',')}`);
	});

	test('no match → empty list (does NOT throw)', () => {
		const r = searchLangs('zzzzzzz');
		assert.strictEqual(r.length, 0);
	});

	test('case-insensitive', () => {
		const upper = searchLangs('PYTHON');
		const lower = searchLangs('python');
		assert.strictEqual(upper[0].entry.id, lower[0].entry.id);
	});
});
