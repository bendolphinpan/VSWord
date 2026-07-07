// T-3.7c.1.a · TOC 占位符 fixture 清单（SSOT）。
//
// 每条 fixture 描述一份 [TOC] 占位符 round-trip 场景。
// - id          : 类别名，同时也是磁盘文件名（<id>.md）
// - file        : 相对本目录的 .md 文件名（冗余方便脚本消费）
// - tier        : 'P0'（本模块单档，不用 mermaid 的 GA/beta 二级分类）
// - description : 场景说明
//
// 三个 fixture 与 tocRoundtrip.test.ts 共享，二处不许各抄一份。

export const TOC_FIXTURES = Object.freeze([
	{ id: 'toc-basic', file: 'toc-basic.md', tier: 'P0', description: '单 [TOC] + 3 heading（H1/H2×2）' },
	{ id: 'toc-nested', file: 'toc-nested.md', tier: 'P0', description: '多级 heading H1..H4' },
	{ id: 'toc-empty', file: 'toc-empty.md', tier: 'P0', description: '空 heading · [TOC] 占位' },
]);

// 兼容 PRD 文案里的驼峰名（`tocFixtures`）—— 保留一个别名，任何一处都能 import。
export const tocFixtures = TOC_FIXTURES;
