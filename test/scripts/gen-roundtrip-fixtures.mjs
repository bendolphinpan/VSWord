#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.8.3 · roundtrip fixture generator.
 *
 *  Produces 30 markdown fixtures under
 *    code-oss/src/vs/workbench/contrib/vsword/test/fixtures/roundtrip/<class>/
 *
 *  All writes go through fs.writeFileSync(path, Buffer) so BOM / CRLF / mixed-EOL
 *  fixtures land on disk with byte-exact contents (no Node string-mode transcoding).
 *
 *  Deterministic — running twice produces the same bytes. Safe to commit both the
 *  generator and its outputs; the tests re-read the committed fixtures via readFileSync.
 *---------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const ROOT = path.join(
	REPO,
	'code-oss', 'src', 'vs', 'workbench', 'contrib', 'vsword',
	'test', 'fixtures', 'roundtrip',
);

const CLASSES = ['typora', 'obsidian', 'pandoc', 'handwritten-mixed', 'edge-encoding', 'degraded', 'perf'];

for (const c of CLASSES) {
	fs.mkdirSync(path.join(ROOT, c), { recursive: true });
}

/** Write a UTF-8 string as bytes (adds no BOM, honours embedded \r\n exactly). */
function writeUtf8(rel, text) {
	const full = path.join(ROOT, rel);
	fs.writeFileSync(full, Buffer.from(text, 'utf-8'));
}
/** Write raw bytes (BOM / mixed-EOL / hand-crafted encodings). */
function writeBytes(rel, buf) {
	const full = path.join(ROOT, rel);
	fs.writeFileSync(full, buf);
}

const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);

// ============================================================================
// typora/ (9) —— Typora 惯用输出：ATX heading、1) 有序表、`*em*`、4bt fence…
// ============================================================================

writeUtf8('typora/heading-atx-basic.md',
`# Heading 1

Body paragraph one.

## Heading 2

Body paragraph two.
`);

writeUtf8('typora/heading-atx-trailing.md',
`# Title #

## Subheading ##

Regular paragraph after trailing-hash headings.
`);

writeUtf8('typora/list-ordered-paren.md',
`Ordered list with paren delimiter (Typora keeps the paren):

1) First item
2) Second item
3) Third item

Follow-up paragraph.
`);

writeUtf8('typora/list-nested-mixed.md',
`- Top level unordered
  1. Nested ordered
  2. Nested ordered two
    - Deep unordered
- Second top level

End.
`);

writeUtf8('typora/emphasis-mixed.md',
`Mixed emphasis: *asterisk-em* and _underscore-em_ side by side.

Also **strong-star** vs __strong-under__ — Typora keeps the raw form.
`);

writeUtf8('typora/code-fence-4bt.md',
'Four-backtick fence lets the code contain triple backticks:\n\n' +
'````ts\n' +
'const s = "```";\n' +
'console.log(s);\n' +
'````\n\n' +
'Tail paragraph.\n');

writeUtf8('typora/blockquote-nested.md',
`> Level 1 quote.
>
> > Nested level 2.
> >
> > > Nested level 3.

After the quote.
`);

writeUtf8('typora/table-basic.md',
`| Col A | Col B | Col C |
| ----- | :---: | ----: |
| a1    |  b1   |    c1 |
| a2    |  b2   |    c2 |

Tail line.
`);

writeUtf8('typora/hr-thematic.md',
`Before rule.

---

Between two rules.

***

After rule.
`);

// ============================================================================
// obsidian/ (5) —— wikilink / callout / frontmatter / math
// ============================================================================

writeUtf8('obsidian/wikilink-plain.md',
`Reference to [[Another Note]] mid-sentence.

And a standalone [[Deep/Nested/Note]].
`);

writeUtf8('obsidian/wikilink-alias.md',
`Alias link: [[Real Target|Display Text]] here.

Bare link: [[Target Only]] for comparison.
`);

writeUtf8('obsidian/callout-note.md',
`> [!NOTE]
> Callout body line 1.
> Callout body line 2.

> [!WARNING] Custom title
> Warning body.

Tail.
`);

writeUtf8('obsidian/frontmatter-yaml.md',
`---
title: Example
tags:
  - md
  - roundtrip
draft: false
---

Body paragraph after YAML frontmatter.

Second paragraph.
`);

writeUtf8('obsidian/math-inline-block.md',
`Inline math \\$a^2 + b^2 = c^2\\$ becomes real: $a^2 + b^2 = c^2$ mid-sentence.

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$

After the block.
`);

// ============================================================================
// pandoc/ (5) —— setext / def-list / footnote / raw html
// ============================================================================

writeUtf8('pandoc/heading-setext.md',
`Heading One
===========

Body under H1.

Heading Two
-----------

Body under H2.
`);

writeUtf8('pandoc/list-tight-loose.md',
`Tight list:

- one
- two
- three

Loose list:

- one

  Continuation paragraph.

- two

  Another paragraph.

Done.
`);

writeUtf8('pandoc/footnote-basic.md',
`Body with a footnote reference[^1] mid-sentence.

Another sentence, another ref[^long].

[^1]: The short footnote body.

[^long]: The long footnote body with multiple lines.
    Continuation of the long footnote.
`);

writeUtf8('pandoc/def-list.md',
`Term 1
:   Definition of term 1.

Term 2
:   Definition of term 2.
    Continuation line.

Tail paragraph.
`);

writeUtf8('pandoc/raw-html-inline.md',
`Paragraph with <span class="hl">inline HTML</span> mid-line.

<div class="callout">
  <p>Block HTML preserved as raw.</p>
</div>

Tail.
`);

// ============================================================================
// handwritten-mixed/ (4)
// ============================================================================

// mixed-eol: LF-only intro, CRLF middle, LF tail — real user output.
{
	const parts = [
		Buffer.from('LF section start.\n\n', 'utf-8'),
		Buffer.from('CRLF middle line one.\r\nCRLF middle line two.\r\n\r\n', 'utf-8'),
		Buffer.from('LF tail paragraph.\n', 'utf-8'),
	];
	writeBytes('handwritten-mixed/mixed-eol.md', Buffer.concat(parts));
}

writeUtf8('handwritten-mixed/emoji-cjk.md',
`# 中文标题 🎉

中英混排段落 with 🚀 emoji inline，测试 CJK + surrogate pair 保真。

- 列表 项目 一
- Item 二 with 家 (U+FA6D CJK compat)
- 🎨 art / 🧪 lab / 👨‍💻 ZWJ sequence
`);

writeUtf8('handwritten-mixed/deep-nesting.md',
`- L1
  - L2
    - L3
      - L4
        - L5
          - L6 (six levels — Typora / Obsidian both accept)

Text after deep nest.
`);

writeUtf8('handwritten-mixed/all-features.md',
`---
title: Kitchen Sink
---

# H1 Title

Paragraph with **bold**, *em*, \`code\`, [link](https://x), [[wiki]], and $x_i$ math.

## List

1. Ordered one
2. Ordered two with \`inline\` code
   - Nested unord
   - Nested unord two

## Table

| A | B |
|---|---|
| 1 | 2 |

## Fenced code

\`\`\`js
const x = 1;
\`\`\`

## Blockquote

> Quote line.

## HR

---

Tail.
`);

// ============================================================================
// edge-encoding/ (5) —— BOM / CRLF / no-newline / whitespace
// ============================================================================

// utf8-bom-lf: BOM + LF-only body.
{
	const body = Buffer.from('# BOM LF\n\nParagraph body.\n', 'utf-8');
	writeBytes('edge-encoding/utf8-bom-lf.md', Buffer.concat([BOM, body]));
}

// utf8-bom-crlf: BOM + CRLF body.
{
	const body = Buffer.from('# BOM CRLF\r\n\r\nParagraph body.\r\n', 'utf-8');
	writeBytes('edge-encoding/utf8-bom-crlf.md', Buffer.concat([BOM, body]));
}

// utf8-nobom-crlf: no BOM + pure CRLF.
{
	const body = Buffer.from('# No BOM CRLF\r\n\r\nBody line one.\r\nBody line two.\r\n', 'utf-8');
	writeBytes('edge-encoding/utf8-nobom-crlf.md', body);
}

// trailing-no-newline: does NOT end with \n.
{
	const body = Buffer.from('# No trailing newline\n\nBody paragraph — file ends here.', 'utf-8');
	writeBytes('edge-encoding/trailing-no-newline.md', body);
}

// whitespace-heavy: tabs + multi-space + trailing spaces (Typora hardbreak).
writeUtf8('edge-encoding/whitespace-heavy.md',
`Paragraph with trailing double-space hardbreak.  \nNext line via hardbreak.

\tIndented with tab (renders as code by CommonMark).

    Indented with four spaces (also code).

Regular tail.
`);

// ============================================================================
// degraded/ (1) —— coverage < 0.95, forces safe=false → path C
// ============================================================================

// Fill ~200 bytes with whitespace-only lines, tiny block in middle.
{
	const pad = ' '.repeat(200);
	const body = pad + '\n\ntiny block\n\n' + pad + '\n';
	writeUtf8('degraded/sparse-coverage.md', body);
}

// ============================================================================
// perf/ (1) —— ~200 KB mixed content, deterministic (no RNG)
// ============================================================================

{
	const chunks = [];
	chunks.push('# Perf fixture — 200 KB mixed content\n\n');
	for (let i = 0; i < 400; i++) {
		chunks.push(`## Section ${i}\n\n`);
		chunks.push(`Paragraph ${i} — Lorem ipsum dolor sit amet, consectetur adipiscing elit. `);
		chunks.push(`Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n\n`);
		if (i % 5 === 0) {
			chunks.push('- item alpha\n- item beta\n- item gamma\n\n');
		}
		if (i % 7 === 0) {
			chunks.push('```ts\nconst x = ' + i + ';\nconsole.log(x);\n```\n\n');
		}
		if (i % 11 === 0) {
			chunks.push('> Quote ' + i + '.\n\n');
		}
		if (i % 13 === 0) {
			chunks.push('| A | B |\n|---|---|\n| ' + i + ' | ' + (i + 1) + ' |\n\n');
		}
	}
	const s = chunks.join('');
	// Pad to at least 200 KB with a tail paragraph if we came in under.
	const target = 200 * 1024;
	let out = s;
	if (out.length < target) {
		out += 'Tail padding — ' + 'x'.repeat(target - out.length - 20) + '\n';
	}
	writeUtf8('perf/200kb-mixed.md', out);
}

// ---------------------------------------------------------------------------

// Print a manifest so CI / humans can eyeball generated sizes.
const walked = [];
for (const c of CLASSES) {
	const dir = path.join(ROOT, c);
	for (const name of fs.readdirSync(dir).sort()) {
		const full = path.join(dir, name);
		const stat = fs.statSync(full);
		walked.push({ rel: path.posix.join(c, name), bytes: stat.size });
	}
}
console.log(`Wrote ${walked.length} fixtures to ${ROOT}`);
for (const w of walked) {
	console.log(`  ${w.bytes.toString().padStart(8)}  ${w.rel}`);
}
