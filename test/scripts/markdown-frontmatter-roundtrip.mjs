#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  VSWord — Markdown frontmatter end-to-end round-trip
 *
 *  parse → update (known fields) → re-parse, asserting on every step:
 *    - known fields parsed (title/created/updated/tags/aliases/status/cover)
 *    - unknown fields preserved (customField / priority / reviewers)
 *    - body preserved byte-for-byte after closing fence
 *    - fenced code block containing `---` is NOT mistaken for frontmatter
 *    - tag input parsing (English + Chinese comma, dedupe)
 *    - newline style preserved (LF stays LF, CRLF stays CRLF)
 *    - update → re-parse is stable (idempotent on same patch)
 *    - documents without frontmatter get one created
 *
 *  Run from repo root after `npm run compile` in code-oss/:
 *      node test/scripts/markdown-frontmatter-roundtrip.mjs
 *--------------------------------------------------------------------------------------------*/

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);

const modulePath = join(repoRoot, 'code-oss', 'out', 'vs', 'workbench', 'contrib', 'vsword', 'common', 'vswordDocumentUtils.js');
if (!existsSync(modulePath)) {
	console.error('[FAIL] Compiled vswordDocumentUtils.js not found at:', modulePath);
	console.error('       Run `npm run compile` in code-oss/ first.');
	process.exit(2);
}
const docUtils = require(modulePath);

const fixturePath = join(repoRoot, 'test', 'fixtures', 'markdown', 'complex-frontmatter.md');
const reportsDir = join(repoRoot, 'test', 'reports');
if (!existsSync(reportsDir)) { mkdirSync(reportsDir, { recursive: true }); }

const original = readFileSync(fixturePath, 'utf8');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, predicate, detail) {
	if (predicate) {
		passed++;
		console.log(`  ok  ${name}`);
	} else {
		failed++;
		failures.push({ name, detail });
		console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
	}
}

function group(title, fn) {
	console.log(`\n# ${title}`);
	fn();
}

// ---------------------------------------------------------------------------
// 1. Parse the fixture — known + unknown + body split
// ---------------------------------------------------------------------------
let base;
group('parse fixture', () => {
	base = docUtils.parseFrontmatter(original);
	check('hasFrontmatter', base.hasFrontmatter === true);
	check('title parsed', base.known.title === 'VSWord 复杂样例文档', `got ${JSON.stringify(base.known.title)}`);
	check('created parsed', base.known.created === '2026-06-20');
	check('updated parsed', base.known.updated === '2026-06-24');
	check('tags parsed', Array.isArray(base.known.tags) && base.known.tags.join('|') === 'writing|roadmap|中文', `got ${JSON.stringify(base.known.tags)}`);
	check('aliases parsed', Array.isArray(base.known.aliases) && base.known.aliases.length === 2);
	check('status parsed', base.known.status === 'draft');
	check('cover parsed', base.known.cover === 'assets/cover.png');
	check('unknown customField preserved', base.unknown.customField === 'keep me untouched', `got ${JSON.stringify(base.unknown.customField)}`);
	check('unknown priority preserved', base.unknown.priority === '高');
	check('unknown reviewers preserved (array)', Array.isArray(base.unknown.reviewers) && base.unknown.reviewers.join('|') === 'pan|alice');
	check('body retains heading', base.body.includes('# VSWord 复杂样例'));
	check('body retains image refs', base.body.includes('![封面](assets/cover.png)') && base.body.includes('./images/diagram.svg'));
});

// ---------------------------------------------------------------------------
// 2. Fenced code block with --- must NOT be parsed as frontmatter delimiter
// ---------------------------------------------------------------------------
group('fenced code block not mistaken for frontmatter', () => {
	check('fake frontmatter inside code fence stays in body', base.body.includes('fake: not frontmatter'));
	check('frontmatter raw does not include code fence content', !(base.frontmatter || '').includes('fake: not frontmatter'));
});

// ---------------------------------------------------------------------------
// 3. parseMarkdownTagsInput — English + Chinese comma, dedupe, trim
// ---------------------------------------------------------------------------
group('tag input parsing', () => {
	check('mixed comma + dedupe + trim', JSON.stringify(docUtils.parseMarkdownTagsInput(' writing, roadmap，中文 , writing')) === JSON.stringify(['writing', 'roadmap', '中文']));
	check('empty input -> undefined', docUtils.parseMarkdownTagsInput('   ,  ，  ') === undefined);
});

// ---------------------------------------------------------------------------
// 4. updateMarkdownFrontmatter — update known fields, preserve unknown + body
// ---------------------------------------------------------------------------
let updated;
group('update known fields preserves unknown + body', () => {
	updated = docUtils.updateMarkdownFrontmatter(original, {
		title: 'VSWord 更新标题',
		status: 'published',
		tags: docUtils.parseMarkdownTagsInput('writing, release')
	});
	const re = docUtils.parseFrontmatter(updated);
	check('title updated', re.known.title === 'VSWord 更新标题', `got ${JSON.stringify(re.known.title)}`);
	check('status updated', re.known.status === 'published');
	check('tags updated', re.known.tags.join('|') === 'writing|release', `got ${JSON.stringify(re.known.tags)}`);
	check('created untouched', re.known.created === '2026-06-20');
	check('cover untouched', re.known.cover === 'assets/cover.png');
	check('unknown customField survives update', re.unknown.customField === 'keep me untouched');
	check('unknown priority survives update', re.unknown.priority === '高');
	check('unknown reviewers survives update', Array.isArray(re.unknown.reviewers) && re.unknown.reviewers.join('|') === 'pan|alice');
	check('body survives update byte-for-byte', re.body === base.body, 'body changed across update');
	check('code fence still intact after update', updated.includes('fake: not frontmatter'));
});

// ---------------------------------------------------------------------------
// 5. idempotency — applying same patch twice yields identical output
// ---------------------------------------------------------------------------
group('update is idempotent on identical patch', () => {
	const again = docUtils.updateMarkdownFrontmatter(updated, {
		title: 'VSWord 更新标题',
		status: 'published',
		tags: docUtils.parseMarkdownTagsInput('writing, release')
	});
	check('second identical update == first', again === updated, 'non-idempotent update');
});

// ---------------------------------------------------------------------------
// 6. newline style preserved (LF stays LF, CRLF stays CRLF)
// ---------------------------------------------------------------------------
group('newline style preserved', () => {
	const lf = '---\ntitle: A\n---\nbody\n';
	const lfOut = docUtils.updateMarkdownFrontmatter(lf, { title: 'B' });
	check('LF document stays LF', !lfOut.includes('\r\n') && lfOut.includes('title: B'));

	const crlf = '---\r\ntitle: A\r\n---\r\nbody\r\n';
	const crlfOut = docUtils.updateMarkdownFrontmatter(crlf, { title: 'B' });
	check('CRLF document stays CRLF', crlfOut.includes('\r\n') && crlfOut.includes('title: B'));
});

// ---------------------------------------------------------------------------
// 7. document without frontmatter gets one created, body preserved
// ---------------------------------------------------------------------------
group('create frontmatter when missing', () => {
	const noFm = '# Heading\n\nBody text\n';
	const out = docUtils.updateMarkdownFrontmatter(noFm, { title: 'New Doc', tags: ['draft'] });
	const re = docUtils.parseFrontmatter(out);
	check('frontmatter created', re.hasFrontmatter === true);
	check('title set on new frontmatter', re.known.title === 'New Doc');
	check('tags set on new frontmatter', re.known.tags.join('|') === 'draft');
	check('original body preserved', re.body.includes('# Heading') && re.body.includes('Body text'));
});

// ---------------------------------------------------------------------------
// 8. word count skips frontmatter
// ---------------------------------------------------------------------------
group('word count', () => {
	const wc = docUtils.countWords(base.body);
	check('counts CJK chars', wc.cjkChars > 0);
	check('counts latin words', wc.words > 0);
	check('reports lines', wc.lines > 0);
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = join(reportsDir, `markdown-frontmatter-roundtrip-${stamp}.json`);
const mdPath = join(reportsDir, `markdown-frontmatter-roundtrip-${stamp}.md`);
writeFileSync(reportPath, JSON.stringify({ passed, failed, failures }, null, 2), 'utf8');
writeFileSync(mdPath, updated ?? '', 'utf8');

console.log(`\nsummary: ${passed} passed, ${failed} failed`);
if (failed > 0) {
	console.log('failures:', JSON.stringify(failures, null, 2));
}
process.exit(failed === 0 ? 0 : 1);
