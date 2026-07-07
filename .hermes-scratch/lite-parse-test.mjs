const text = `Heading One
===========

Body under H1.

Heading Two
-----------

Body under H2.
`;

function guessType(firstLine) {
	const s = firstLine.trimStart();
	if (s.startsWith('#')) { return 'heading'; }
	if (s.startsWith('>')) { return 'blockquote'; }
	if (s.startsWith('- ') || s.startsWith('* ') || s.startsWith('+ ')) { return 'list'; }
	if (/^\d+[.)]\s/.test(s)) { return 'list'; }
	if (s.startsWith('```') || s.startsWith('~~~')) { return 'code'; }
	if (s.startsWith('|')) { return 'table'; }
	if (s === '---' || s === '***' || s === '___') { return 'thematicBreak'; }
	return 'paragraph';
}

const YAML_FM_RE = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

function splitLinesWithOffsets(text, from) {
	const out = [];
	let lineStart = from;
	let i = from;
	while (i < text.length) {
		const c = text.charCodeAt(i);
		if (c === 0x0d) {
			const next = text.charCodeAt(i + 1);
			out.push({ content: text.slice(lineStart, i), startOffset: lineStart, endOffset: i });
			i += (next === 0x0a) ? 2 : 1;
			lineStart = i;
		} else if (c === 0x0a) {
			out.push({ content: text.slice(lineStart, i), startOffset: lineStart, endOffset: i });
			i += 1;
			lineStart = i;
		} else {
			i++;
		}
	}
	if (lineStart <= text.length) {
		out.push({ content: text.slice(lineStart, text.length), startOffset: lineStart, endOffset: text.length });
	}
	return out;
}

function liteParse(text) {
	const children = [];
	let cursor = 0;
	if (text.length > 0 && text.charCodeAt(0) === 0xFEFF) { cursor = 1; }
	const rest = text.slice(cursor);
	const fm = YAML_FM_RE.exec(rest);
	if (fm && fm.index === 0) {
		const fmText = fm[0];
		let endOffset = cursor + fmText.length;
		if (fmText.endsWith('\r\n')) { endOffset -= 2; }
		else if (fmText.endsWith('\n')) { endOffset -= 1; }
		children.push({
			type: 'yaml',
			position: { start: { offset: cursor }, end: { offset: endOffset } },
		});
		cursor = endOffset;
	}
	const lines = splitLinesWithOffsets(text, cursor);
	let bs = -1, bl = -1;
	for (let i = 0; i < lines.length; i++) {
		const isBlank = /^[ \t\r]*$/.test(lines[i].content);
		if (!isBlank) {
			if (bs < 0) { bs = i; }
			bl = i;
		} else {
			if (bs >= 0) {
				children.push({
					type: guessType(lines[bs].content),
					position: { start: { offset: lines[bs].startOffset }, end: { offset: lines[bl].endOffset } },
				});
				bs = -1;
			}
		}
	}
	if (bs >= 0) {
		children.push({
			type: guessType(lines[bs].content),
			position: { start: { offset: lines[bs].startOffset }, end: { offset: lines[bl].endOffset } },
		});
	}
	return { type: 'root', children };
}

const root = liteParse(text);
console.log(JSON.stringify(root, null, 2));
