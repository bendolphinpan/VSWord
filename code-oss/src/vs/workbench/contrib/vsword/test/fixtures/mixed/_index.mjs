// T-3.5b-flowseq.3c · 三库联合 fixture 清单（SSOT）。
//
// mixed fixture 用途：同一份 md 里同时含 mermaid / flow / sequence 三种 code_block，
// 一次 round-trip 覆盖 3 库并存场景。每个 block 用对应 worker render 得到独立 SVG，
// 与其在各库单库 fixture 里的 golden 逐字节比对（避免维护重复 golden）。
//
// 每条 mixed fixture：
// - id      : 磁盘文件名（<id>.md）
// - segments: [{ lang: 'mermaid' | 'flow' | 'sequence', fixtureId, src }]
//             fixtureId 引用对应 _index.mjs 里的条目 id（用来找 golden）；
//             src 是同一份源码（内联，便于 md 生成器直接用，无需再解析）。

export const MIXED_FIXTURES = [
	{
		id: 'all-three-basic',
		segments: [
			// mermaid basic flowchart
			{ lang: 'mermaid', fixtureId: 'flowchart', src: `flowchart LR\n  A --> B --> C` },
			// flowchart.js basic
			{ lang: 'flow', fixtureId: 'flow-basic', src: `st=>start: Start\nop=>operation: My Operation\ne=>end: End\n\nst->op->e` },
			// js-sequence-diagrams basic
			{ lang: 'sequence', fixtureId: 'seq-basic', src: `title: Basic hello\nAlice->Bob: Hi Bob\nBob-->Alice: Hello Alice` },
		],
	},
];

/** 把 segments 拼成完整 md 内容。 */
export function toMarkdown(segments) {
	const parts = [];
	parts.push('# All three diagrams round-trip\n');
	parts.push('单文档同时含 mermaid / flow / sequence 三种 code block，用于跨库联合 round-trip 校验。\n');
	for (const seg of segments) {
		parts.push('```' + seg.lang + '\n' + seg.src + (seg.src.endsWith('\n') ? '' : '\n') + '```');
		parts.push('');
	}
	return parts.join('\n') + '\n';
}
