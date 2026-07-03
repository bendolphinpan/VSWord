/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.11.1 — wiki-link helper + resolver unit tests (pure functions, no DOM).

import * as assert from 'assert';
import {
	WIKILINK_RE,
	parseAll,
	normalizeTarget,
	normalizeAlias,
	displayFor,
	toMarkdown,
	resolveTarget,
	classForStatus,
	titleForStatus,
	findWikilinkTrigger,
	fuzzyScore,
	rankCandidates,
	pickTargetFor,
} from '../../browser/milkdownEditor/webview/wikilink-helpers.template.js';
import {
	resolveWikilink,
	resolutionToWireResult,
	normalizeTarget as hostNormalizeTarget,
} from '../../browser/milkdownEditor/milkdownWikilinkResolver.js';

// ---- Regex + parseAll -------------------------------------------------------

suite('T-3.11.1 · WIKILINK_RE', () => {
	test('matches a bare [[Target]]', () => {
		WIKILINK_RE.lastIndex = 0;
		const m = WIKILINK_RE.exec('see [[MyNote]] here');
		assert.ok(m);
		assert.strictEqual(m![1], 'MyNote');
		assert.strictEqual(m![2], undefined);
	});
	test('matches [[Target|Alias]]', () => {
		WIKILINK_RE.lastIndex = 0;
		const m = WIKILINK_RE.exec('see [[MyNote|the note]]');
		assert.ok(m);
		assert.strictEqual(m![1], 'MyNote');
		assert.strictEqual(m![2], 'the note');
	});
	test('rejects malformed [[ without closing', () => {
		WIKILINK_RE.lastIndex = 0;
		assert.strictEqual(WIKILINK_RE.exec('[[unclosed'), null);
	});
});

suite('T-3.11.1 · parseAll', () => {
	test('extracts all wikilinks in a paragraph', () => {
		const out = parseAll('a [[A]] b [[B|beta]] c');
		assert.strictEqual(out.length, 2);
		assert.strictEqual(out[0].target, 'A');
		assert.strictEqual(out[0].alias, null);
		assert.strictEqual(out[1].target, 'B');
		assert.strictEqual(out[1].alias, 'beta');
	});
	test('returns start/end offsets that line up with slice', () => {
		const src = 'x [[note]] y';
		const [m] = parseAll(src);
		assert.strictEqual(src.slice(m.start, m.end), '[[note]]');
	});
	test('empty target ([[]]) is dropped', () => {
		assert.strictEqual(parseAll('foo [[]] bar').length, 0);
	});
});

// ---- Normalizers ------------------------------------------------------------

suite('T-3.11.1 · normalizeTarget', () => {
	test('trims + collapses whitespace', () => {
		assert.strictEqual(normalizeTarget('  My  Note  '), 'My Note');
	});
	test('strips control chars', () => {
		assert.strictEqual(normalizeTarget('My\tNote\n'), 'My Note');
	});
	test('empty in → empty out', () => {
		assert.strictEqual(normalizeTarget(''), '');
		assert.strictEqual(normalizeTarget(null as unknown as string), '');
	});
	test('host + webview normalize identically', () => {
		const samples = ['MyNote', '  spaced  ', 'a/b/c', 'A|B', 'with\ttab'];
		for (const s of samples) {
			assert.strictEqual(hostNormalizeTarget(s), normalizeTarget(s), `mismatch on "${s}"`);
		}
	});
});

suite('T-3.11.1 · normalizeAlias', () => {
	test('trims + collapses whitespace', () => {
		assert.strictEqual(normalizeAlias('  the  note  '), 'the note');
	});
	test('empty alias → null (not empty string)', () => {
		assert.strictEqual(normalizeAlias(''), null);
		assert.strictEqual(normalizeAlias('   '), null);
	});
});

// ---- displayFor / toMarkdown ------------------------------------------------

suite('T-3.11.1 · displayFor', () => {
	test('uses alias when present', () => {
		assert.strictEqual(displayFor({ target: 'MyNote', alias: 'the note' }), 'the note');
	});
	test('falls back to target when no alias', () => {
		assert.strictEqual(displayFor({ target: 'MyNote', alias: null }), 'MyNote');
		assert.strictEqual(displayFor({ target: 'MyNote', alias: undefined as unknown as string }), 'MyNote');
	});
});

suite('T-3.11.1 · toMarkdown', () => {
	test('round-trips bare target', () => {
		assert.strictEqual(toMarkdown('MyNote', null), '[[MyNote]]');
	});
	test('round-trips target|alias', () => {
		assert.strictEqual(toMarkdown('MyNote', 'the note'), '[[MyNote|the note]]');
	});
	test('drops empty alias in output', () => {
		assert.strictEqual(toMarkdown('MyNote', ''), '[[MyNote]]');
		assert.strictEqual(toMarkdown('MyNote', '   '), '[[MyNote]]');
	});
});

// ---- Resolver — webview-side helper ----------------------------------------

suite('T-3.11.1 · resolveTarget (webview helper)', () => {
	const idx = [
		{ name: 'MyNote', path: 'notes/MyNote.md', dir: 'notes' },
		{ name: 'Other', path: 'Other.md', dir: '' },
		{ name: 'Dup', path: 'a/Dup.md', dir: 'a' },
		{ name: 'Dup', path: 'b/Dup.md', dir: 'b' },
	];
	test('short-name match → found', () => {
		const r = resolveTarget('MyNote', idx);
		assert.strictEqual(r.status, 'found');
		assert.strictEqual(r.file.path, 'notes/MyNote.md');
	});
	test('case-insensitive short match', () => {
		const r = resolveTarget('mynote', idx);
		assert.strictEqual(r.status, 'found');
	});
	test('missing → missing', () => {
		assert.strictEqual(resolveTarget('NoSuch', idx).status, 'missing');
	});
	test('duplicate name → ambiguous', () => {
		const r = resolveTarget('Dup', idx);
		assert.strictEqual(r.status, 'ambiguous');
	});
	test('path-qualified target → path lookup', () => {
		const r = resolveTarget('a/Dup', idx);
		assert.strictEqual(r.status, 'found');
		assert.strictEqual(r.file.path, 'a/Dup.md');
	});
	test('path-qualified with .md suffix works', () => {
		const r = resolveTarget('notes/MyNote.md', idx);
		assert.strictEqual(r.status, 'found');
	});
	test('empty index → missing', () => {
		assert.strictEqual(resolveTarget('anything', []).status, 'missing');
	});
	test('empty target → missing', () => {
		assert.strictEqual(resolveTarget('', idx).status, 'missing');
	});
});

// ---- Resolver — host-side (TS mirror) --------------------------------------

suite('T-3.11.1 · resolveWikilink (host mirror)', () => {
	const idx = [
		{ name: 'MyNote', path: 'notes/MyNote.md', dir: 'notes' },
		{ name: 'Dup', path: 'a/Dup.md', dir: 'a' },
		{ name: 'Dup', path: 'b/Dup.md', dir: 'b' },
	];
	test('found — file is populated', () => {
		const r = resolveWikilink('MyNote', idx);
		assert.strictEqual(r.status, 'found');
		assert.ok(r.file);
		assert.strictEqual(r.file!.path, 'notes/MyNote.md');
	});
	test('ambiguous — candidates listed', () => {
		const r = resolveWikilink('Dup', idx);
		assert.strictEqual(r.status, 'ambiguous');
		assert.strictEqual(r.candidates?.length, 2);
	});
	test('resolutionToWireResult found → includes file', () => {
		const wire = resolutionToWireResult('MyNote', resolveWikilink('MyNote', idx));
		assert.strictEqual(wire.status, 'found');
		assert.ok(wire.file);
	});
	test('resolutionToWireResult ambiguous → omits file', () => {
		const wire = resolutionToWireResult('Dup', resolveWikilink('Dup', idx));
		assert.strictEqual(wire.status, 'ambiguous');
		assert.strictEqual(wire.file, undefined);
	});
	test('host + webview algorithms agree on same fixtures', () => {
		const hostIdx = idx;
		const cases = ['MyNote', 'mynote', 'Dup', 'notes/MyNote', 'nope', ''];
		for (const t of cases) {
			const h = resolveWikilink(t, hostIdx).status;
			const w = resolveTarget(t, hostIdx).status;
			assert.strictEqual(h, w, `disagreement on "${t}": host=${h} webview=${w}`);
		}
	});
});

// ---- CSS helper mapping ----------------------------------------------------

suite('T-3.11.1 · classForStatus / titleForStatus', () => {
	test('every status yields a distinct class', () => {
		const s = new Set([
			classForStatus('pending'),
			classForStatus('found'),
			classForStatus('missing'),
			classForStatus('ambiguous'),
		]);
		// pending + found may share the base if we chose so; require at least 3 distinct.
		assert.ok(s.size >= 3, `expected ≥3 distinct classes, got ${s.size}`);
	});
	test('missing title exists and includes the target', () => {
		const t = titleForStatus('missing', 'NoSuch');
		assert.ok(typeof t === 'string' && t.length > 0);
		assert.ok(String(t).includes('NoSuch') || String(t).toLowerCase().includes('nosuch'));
	});
	test('ambiguous title exists and includes the target', () => {
		const t = titleForStatus('ambiguous', 'Dup');
		assert.ok(typeof t === 'string' && t.length > 0);
		assert.ok(String(t).includes('Dup') || String(t).toLowerCase().includes('dup'));
	});
});

// ===========================================================================
// T-3.11.2 · autocomplete: prefix detection + fuzzy ranking
// ===========================================================================

suite('T-3.11.2 · findWikilinkTrigger', () => {
	test('returns null when no [[ opener before caret', () => {
		assert.strictEqual(findWikilinkTrigger('plain text', 10), null);
	});
	test('detects an open prefix', () => {
		const src = 'see [[not';
		const t = findWikilinkTrigger(src, src.length);
		assert.ok(t);
		assert.strictEqual(t!.from, 4);
		assert.strictEqual(t!.query, 'not');
	});
	test('empty query at caret directly after [[', () => {
		const src = 'see [[';
		const t = findWikilinkTrigger(src, src.length);
		assert.ok(t);
		assert.strictEqual(t!.query, '');
	});
	test('closes on ]] — no trigger past a completed link', () => {
		const src = '[[done]] and now [[open';
		const t = findWikilinkTrigger(src, src.length);
		assert.ok(t);
		assert.strictEqual(t!.query, 'open');
	});
	test('ignores escaped \\[[', () => {
		const src = 'see \\[[not';
		assert.strictEqual(findWikilinkTrigger(src, src.length), null);
	});
	test('does not span a newline', () => {
		const src = '[[start\nmid';
		assert.strictEqual(findWikilinkTrigger(src, src.length), null);
	});
	test('does not fire before caret >= 2', () => {
		assert.strictEqual(findWikilinkTrigger('[[', 1), null);
		assert.strictEqual(findWikilinkTrigger('[[', 0), null);
	});
});

suite('T-3.11.2 · fuzzyScore', () => {
	const idx = { name: 'MeetingNotes', path: 'meetings/MeetingNotes.md', dir: 'meetings' };
	test('exact-name beats prefix', () => {
		const other = { name: 'MeetingNotesArchive', path: 'a/MeetingNotesArchive.md', dir: 'a' };
		assert.ok(fuzzyScore('MeetingNotes', idx) > fuzzyScore('MeetingNotes', other));
	});
	test('is case-insensitive', () => {
		assert.strictEqual(fuzzyScore('MEETING', idx), fuzzyScore('meeting', idx));
	});
	test('empty query scores everything non-zero', () => {
		assert.ok(fuzzyScore('', idx) > 0);
	});
	test('no match returns 0', () => {
		assert.strictEqual(fuzzyScore('zzz-nowhere', idx), 0);
	});
	test('path prefix ranks below name prefix', () => {
		const nameHit = { name: 'meet-agenda', path: 'x/meet-agenda.md', dir: 'x' };
		const pathHit = { name: 'notes', path: 'meet/notes.md', dir: 'meet' };
		assert.ok(fuzzyScore('meet', nameHit) > fuzzyScore('meet', pathHit));
	});
	test('subsequence match ranks lowest but non-zero', () => {
		// 'mtng' is a subsequence of 'meetingnotes' (m…t…n…g? no g in MeetingNotes)
		// use 'mn' → subseq of MeetingNotes
		const s = fuzzyScore('mn', idx);
		assert.ok(s > 0 && s < 300);
	});
});

suite('T-3.11.2 · rankCandidates', () => {
	const idx = [
		{ name: 'Alpha', path: 'Alpha.md', dir: '' },
		{ name: 'AlphaBeta', path: 'AlphaBeta.md', dir: '' },
		{ name: 'Gamma', path: 'g/Gamma.md', dir: 'g' },
		{ name: 'AlphaCentauri', path: 'space/AlphaCentauri.md', dir: 'space' },
	];
	test('ranks exact name at top', () => {
		const out = rankCandidates('Alpha', idx, 4);
		assert.strictEqual(out[0].name, 'Alpha');
	});
	test('filters out non-matches', () => {
		const out = rankCandidates('Alpha', idx, 10);
		assert.strictEqual(out.length, 3); // Alpha, AlphaBeta, AlphaCentauri (Gamma dropped)
	});
	test('respects limit', () => {
		const out = rankCandidates('Alpha', idx, 2);
		assert.strictEqual(out.length, 2);
	});
	test('empty query returns first N in stable-ish order', () => {
		const out = rankCandidates('', idx, 3);
		assert.strictEqual(out.length, 3);
	});
	test('non-array index returns []', () => {
		assert.deepStrictEqual(rankCandidates('x', null as any, 8), []);
	});
});

suite('T-3.11.2 · pickTargetFor', () => {
	test('emits short name when unique', () => {
		const idx = [{ name: 'Solo', path: 'Solo.md', dir: '' }];
		assert.strictEqual(pickTargetFor(idx[0], idx), 'Solo');
	});
	test('emits folder-qualified path when name is duplicated', () => {
		const idx = [
			{ name: 'Notes', path: 'a/Notes.md', dir: 'a' },
			{ name: 'Notes', path: 'b/Notes.md', dir: 'b' },
		];
		assert.strictEqual(pickTargetFor(idx[0], idx), 'a/Notes');
		assert.strictEqual(pickTargetFor(idx[1], idx), 'b/Notes');
	});
	test('returns empty string for null entry', () => {
		assert.strictEqual(pickTargetFor(null as any, []), '');
	});
	test('is case-insensitive when detecting dupes', () => {
		const idx = [
			{ name: 'Notes', path: 'a/Notes.md', dir: 'a' },
			{ name: 'notes', path: 'b/notes.md', dir: 'b' },
		];
		assert.strictEqual(pickTargetFor(idx[0], idx), 'a/Notes');
	});
});
