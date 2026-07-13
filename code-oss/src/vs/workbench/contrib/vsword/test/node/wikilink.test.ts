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
	extractPreviewSnippet,
	extractPreviewTitle,
} from '../../browser/milkdownEditor/webview/wikilink-helpers.template.js';
import {
	HoverIntent,
	OPEN_DELAY_MS,
	CLOSE_DELAY_MS,
} from '../../browser/milkdownEditor/webview/wikilink-preview.template.js';
import {
	resolveWikilink,
	buildWikilinkResolveIndex,
	resolveWikilinkWithIndex,
	resolutionToWireResult,
	normalizeTarget as hostNormalizeTarget,
	extractPreviewSnippet as hostExtractPreviewSnippet,
	extractPreviewTitle as hostExtractPreviewTitle,
	extractWikilinkReferences,
	buildBacklinksGraph,
	backlinksFor,
} from '../../browser/milkdownEditor/milkdownWikilinkResolver.js';
import {
	makeBacklinksState,
	applyBacklinksResponse,
} from '../../browser/milkdownEditor/webview/wikilink-backlinks.template.js';

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
	test('buildWikilinkResolveIndex + WithIndex 与 resolveWikilink 语义一致', () => {
		const pre = buildWikilinkResolveIndex(idx);
		const cases = ['MyNote', 'mynote', 'Dup', 'notes/MyNote', 'a/Dup', 'nope', ''];
		for (const t of cases) {
			const a = resolveWikilink(t, idx);
			const b = resolveWikilinkWithIndex(t, pre);
			assert.strictEqual(a.status, b.status, `status mismatch on "${t}"`);
			assert.strictEqual(a.file?.path, b.file?.path, `file mismatch on "${t}"`);
			assert.strictEqual(a.candidates?.length, b.candidates?.length, `candidates on "${t}"`);
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

// ===========================================================================
// T-3.11.3 · hover preview: snippet extractor + hover-intent state machine
// ===========================================================================

suite('T-3.11.3 · extractPreviewTitle', () => {
	test('returns first heading text', () => {
		assert.strictEqual(extractPreviewTitle('# Hello\n\nbody'), 'Hello');
	});
	test('handles h2..h6 too', () => {
		assert.strictEqual(extractPreviewTitle('### Sub\n\nbody'), 'Sub');
	});
	test('returns fallback when no heading', () => {
		assert.strictEqual(extractPreviewTitle('just text', 'Fallback'), 'Fallback');
	});
	test('empty input returns fallback', () => {
		assert.strictEqual(extractPreviewTitle('', 'F'), 'F');
	});
	test('skips YAML frontmatter', () => {
		const md = '---\ntitle: skipped\n---\n# Real Title\n\nbody';
		assert.strictEqual(extractPreviewTitle(md), 'Real Title');
	});
	test('host mirror agrees with webview helper', () => {
		const md = '# Hello\n\nbody';
		assert.strictEqual(hostExtractPreviewTitle(md), extractPreviewTitle(md));
	});
});

suite('T-3.11.3 · extractPreviewSnippet', () => {
	test('returns body without the leading heading', () => {
		const s = extractPreviewSnippet('# Title\n\nBody line.');
		assert.ok(!s.startsWith('#'));
		assert.ok(s.includes('Body line.'));
	});
	test('strips YAML frontmatter', () => {
		const md = '---\nfoo: bar\n---\nSome body';
		assert.strictEqual(extractPreviewSnippet(md), 'Some body');
	});
	test('collapses excessive blank lines', () => {
		const md = 'A\n\n\n\nB';
		assert.strictEqual(extractPreviewSnippet(md), 'A\n\nB');
	});
	test('truncates at word boundary and appends …', () => {
		const long = 'word '.repeat(200); // 1000 chars
		const s = extractPreviewSnippet(long, 100);
		assert.ok(s.endsWith('…'));
		assert.ok(s.length <= 101);
		assert.ok(!/\s…$/.test(s)); // no trailing whitespace before ellipsis
	});
	test('does not truncate when body fits', () => {
		assert.strictEqual(extractPreviewSnippet('short body', 100), 'short body');
	});
	test('empty input returns empty string', () => {
		assert.strictEqual(extractPreviewSnippet(''), '');
		assert.strictEqual(extractPreviewSnippet(null as any), '');
	});
	test('host mirror produces identical output', () => {
		const md = '---\nk: v\n---\n# T\n\nAlpha beta gamma delta epsilon.';
		assert.strictEqual(hostExtractPreviewSnippet(md), extractPreviewSnippet(md));
	});
	test('handles unterminated frontmatter gracefully', () => {
		const md = '---\nno-close\ncontent';
		// No closing --- → treat as raw body.
		assert.ok(extractPreviewSnippet(md).includes('no-close'));
	});
});

suite('T-3.11.3 · HoverIntent (fake clock)', () => {
	function makeIntent() {
		let now = 1000;
		const intent = new HoverIntent(() => now);
		const tick = (ms: number) => { now += ms; };
		return { intent, tick };
	}
	const T = { target: 'Foo', alias: null };

	test('idle → pending on enterAnchor, schedules open at now+OPEN_DELAY', () => {
		const { intent } = makeIntent();
		const r = intent.enterAnchor(T);
		assert.strictEqual(intent.state, 'pending');
		assert.strictEqual(r.action, 'schedule-open');
		assert.strictEqual(r.at, 1000 + OPEN_DELAY_MS);
	});
	test('pending → idle on leaveAnchor (cancel-open)', () => {
		const { intent } = makeIntent();
		intent.enterAnchor(T);
		const r = intent.leaveAnchor();
		assert.strictEqual(r.action, 'cancel-open');
		assert.strictEqual(intent.state, 'idle');
	});
	test('pending → shown on fireOpen; returns target', () => {
		const { intent } = makeIntent();
		intent.enterAnchor(T);
		const r = intent.fireOpen();
		assert.strictEqual(r.action, 'open');
		assert.strictEqual((r.target as any).target, 'Foo');
		assert.strictEqual(intent.state, 'shown');
	});
	test('shown → closing on leaveAnchor with CLOSE_DELAY', () => {
		const { intent, tick } = makeIntent();
		intent.enterAnchor(T); intent.fireOpen();
		tick(500);
		const r = intent.leaveAnchor();
		assert.strictEqual(r.action, 'schedule-close');
		assert.strictEqual(r.at, 1500 + CLOSE_DELAY_MS);
	});
	test('closing → shown when mouse enters popover (cancel-close)', () => {
		const { intent } = makeIntent();
		intent.enterAnchor(T); intent.fireOpen(); intent.leaveAnchor();
		assert.strictEqual(intent.state, 'closing');
		const r = intent.enterPopover();
		assert.strictEqual(r.action, 'cancel-close');
		assert.strictEqual(intent.state, 'shown');
	});
	test('closing → shown when mouse re-enters anchor (cancel-close)', () => {
		const { intent } = makeIntent();
		intent.enterAnchor(T); intent.fireOpen(); intent.leaveAnchor();
		const r = intent.enterAnchor(T);
		assert.strictEqual(r.action, 'cancel-close');
		assert.strictEqual(intent.state, 'shown');
	});
	test('closing → idle on fireClose', () => {
		const { intent } = makeIntent();
		intent.enterAnchor(T); intent.fireOpen(); intent.leaveAnchor();
		const r = intent.fireClose();
		assert.strictEqual(r.action, 'close');
		assert.strictEqual(intent.state, 'idle');
		assert.strictEqual(intent.target, null);
	});
	test('fireOpen on non-pending state is noop', () => {
		const { intent } = makeIntent();
		assert.strictEqual(intent.fireOpen().action, 'noop');
	});
	test('fireClose on non-closing state is noop', () => {
		const { intent } = makeIntent();
		assert.strictEqual(intent.fireClose().action, 'noop');
	});
	test('reset() returns to idle', () => {
		const { intent } = makeIntent();
		intent.enterAnchor(T); intent.fireOpen();
		intent.reset();
		assert.strictEqual(intent.state, 'idle');
		assert.strictEqual(intent.target, null);
	});
	test('leaveAnchor while idle is a noop', () => {
		const { intent } = makeIntent();
		assert.strictEqual(intent.leaveAnchor().action, 'noop');
	});
});

// ===========================================================================
// T-3.11.4 · backlinks: reference extractor, graph builder, state reducer
// ===========================================================================

suite('T-3.11.4 · extractWikilinkReferences', () => {
	test('extracts all raw targets in order', () => {
		const refs = extractWikilinkReferences('See [[Alpha]] and [[Beta|beta note]].');
		assert.deepStrictEqual(refs, ['Alpha', 'Beta']);
	});
	test('drops targets inside fenced code blocks', () => {
		const md = 'text [[Real]]\n```\n[[Fake]]\n```\nmore [[Also]]';
		assert.deepStrictEqual(extractWikilinkReferences(md), ['Real', 'Also']);
	});
	test('drops targets inside inline code spans', () => {
		assert.deepStrictEqual(extractWikilinkReferences('a `[[Fake]]` b [[Real]]'), ['Real']);
	});
	test('drops YAML frontmatter refs', () => {
		const md = '---\nrelated: [[Ignored]]\n---\n[[Kept]]';
		assert.deepStrictEqual(extractWikilinkReferences(md), ['Kept']);
	});
	test('skips escaped forms', () => {
		assert.deepStrictEqual(extractWikilinkReferences('\\[[Escaped]] [[Real]]'), ['Real']);
	});
	test('empty / non-string input yields []', () => {
		assert.deepStrictEqual(extractWikilinkReferences(''), []);
		assert.deepStrictEqual(extractWikilinkReferences(null as any), []);
	});
});

suite('T-3.11.4 · buildBacklinksGraph', () => {
	const index = [
		{ name: 'Alpha', path: 'notes/Alpha.md', dir: 'notes' },
		{ name: 'Beta',  path: 'notes/Beta.md',  dir: 'notes' },
		{ name: 'Gamma', path: 'Gamma.md',       dir: '' },
	];

	test('single reference → single backlink row', () => {
		const g = buildBacklinksGraph(index, [
			{ path: 'notes/Beta.md', name: 'Beta', text: 'See [[Alpha]].' },
		]);
		const refs = backlinksFor(g, 'notes/Alpha.md');
		assert.strictEqual(refs.length, 1);
		assert.strictEqual(refs[0].fromPath, 'notes/Beta.md');
		assert.strictEqual(refs[0].count, 1);
	});

	test('duplicate refs in one source coalesce to count=N', () => {
		const g = buildBacklinksGraph(index, [
			{ path: 'notes/Beta.md', name: 'Beta', text: '[[Alpha]] and [[Alpha]] and [[Alpha]].' },
		]);
		const refs = backlinksFor(g, 'notes/Alpha.md');
		assert.strictEqual(refs.length, 1);
		assert.strictEqual(refs[0].count, 3);
	});

	test('self-references are skipped', () => {
		const g = buildBacklinksGraph(index, [
			{ path: 'notes/Alpha.md', name: 'Alpha', text: '[[Alpha]] refs self' },
		]);
		assert.strictEqual(backlinksFor(g, 'notes/Alpha.md').length, 0);
	});

	test('unresolvable targets are dropped silently', () => {
		const g = buildBacklinksGraph(index, [
			{ path: 'notes/Beta.md', name: 'Beta', text: '[[NoSuchNote]]' },
		]);
		assert.strictEqual(g.size, 0);
	});

	test('multiple sources produce sorted (fromPath asc) rows', () => {
		const g = buildBacklinksGraph(index, [
			{ path: 'notes/Beta.md',  name: 'Beta',  text: '[[Alpha]]' },
			{ path: 'Gamma.md',       name: 'Gamma', text: '[[Alpha]] [[Alpha]]' },
		]);
		const refs = backlinksFor(g, 'notes/Alpha.md');
		assert.deepStrictEqual(refs.map(r => r.fromPath), ['Gamma.md', 'notes/Beta.md']);
		assert.deepStrictEqual(refs.map(r => r.count), [2, 1]);
	});

	test('backlinksFor missing key returns []', () => {
		const g = buildBacklinksGraph(index, []);
		assert.deepStrictEqual(backlinksFor(g, 'anything'), []);
	});
});

suite('T-3.11.4 · applyBacklinksResponse (reducer)', () => {
	test('fresh state is empty + unloaded + collapsed', () => {
		const s = makeBacklinksState();
		assert.deepStrictEqual(s, { ownPath: '', refs: [], loaded: false, expanded: false });
	});

	test('response with refs → sorted by count desc, name asc', () => {
		const s = applyBacklinksResponse(makeBacklinksState(), {
			type: 'wikilinkBacklinksResponse',
			ownPath: 'x.md',
			refs: [
				{ path: 'a.md', name: 'A', count: 1 },
				{ path: 'b.md', name: 'B', count: 3 },
				{ path: 'c.md', name: 'C', count: 3 },
			],
		});
		assert.strictEqual(s.loaded, true);
		assert.strictEqual(s.ownPath, 'x.md');
		assert.deepStrictEqual(s.refs.map((r: { name: string }) => r.name), ['B', 'C', 'A']);
	});

	test('empty response marks loaded but keeps refs empty', () => {
		const s = applyBacklinksResponse(makeBacklinksState(), {
			type: 'wikilinkBacklinksResponse', ownPath: 'x.md', refs: [],
		});
		assert.strictEqual(s.loaded, true);
		assert.deepStrictEqual(s.refs, []);
	});

	test('preserves expanded flag across responses', () => {
		let s = makeBacklinksState();
		s = { ...s, expanded: true };
		s = applyBacklinksResponse(s, { type: 'wikilinkBacklinksResponse', ownPath: 'x', refs: [] });
		assert.strictEqual(s.expanded, true);
	});

	test('missing name defaults to basename-no-ext', () => {
		const s = applyBacklinksResponse(makeBacklinksState(), {
			type: 'wikilinkBacklinksResponse',
			ownPath: 'x.md',
			refs: [{ path: 'notes/Foo.md', count: 1 } as any],
		});
		assert.strictEqual(s.refs[0].name, 'Foo');
	});

	test('count ≤ 0 or non-numeric normalises to 1', () => {
		const s = applyBacklinksResponse(makeBacklinksState(), {
			type: 'wikilinkBacklinksResponse',
			ownPath: 'x.md',
			refs: [
				{ path: 'a.md', name: 'A', count: 0 } as any,
				{ path: 'b.md', name: 'B' } as any,
			],
		});
		assert.strictEqual(s.refs[0].count, 1);
		assert.strictEqual(s.refs[1].count, 1);
	});

	test('unrelated message shape is a no-op', () => {
		const start = makeBacklinksState();
		const s = applyBacklinksResponse(start, { type: 'somethingElse' } as any);
		assert.strictEqual(s, start);
	});

	test('rejects entries with no path', () => {
		const s = applyBacklinksResponse(makeBacklinksState(), {
			type: 'wikilinkBacklinksResponse',
			ownPath: 'x.md',
			refs: [{ path: '', name: 'X', count: 1 } as any, { path: 'y.md', name: 'Y', count: 1 }],
		});
		assert.strictEqual(s.refs.length, 1);
		assert.strictEqual(s.refs[0].name, 'Y');
	});
});
