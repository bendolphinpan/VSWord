// T-3.5b-flowseq.3c · Flowchart.js fixture 清单（SSOT）。
//
// 每条 fixture 描述一份最小可渲染的 flowchart.js 源码。
// - id     : 类别名，同时也是磁盘文件名（<id>.md / <id>.golden.svg）
// - tier   : 'P0'（首批 golden 覆盖；后续可扩 P1/P2）
// - src    : flowchart.js 源码（会被包进 ```flow ... ``` code block 写入 .md）
// - notes  : 可选说明
//
// 与 typora round-trip fixture (test/fixtures/roundtrip/typora/flowchart-*.md) 语法一致，
// 但去掉外层 md 上下文，只留纯 flowchart 源码，便于 worker 逐条 render。

export const FLOW_FIXTURES = [
	{
		id: 'flow-basic',
		tier: 'P0',
		src: `st=>start: Start
op=>operation: My Operation
e=>end: End

st->op->e`,
	},
	{
		id: 'flow-condition',
		tier: 'P0',
		src: `st=>start: Start
op1=>operation: Load data
cond=>condition: Data valid?
op2=>operation: Process
op3=>operation: Report error
e=>end: End

st->op1->cond
cond(yes)->op2->e
cond(no)->op3->e`,
	},
	{
		id: 'flow-parallel',
		tier: 'P0',
		src: `st=>start: 开始
op1=>operation: 步骤 A
op2=>operation: 步骤 B
op3=>operation: 步骤 C
e=>end: 结束

st->op1
op1->op2
op2->op3
op3->e`,
	},
];

/** 把源码包成完整 md 内容（带 flow code fence）。 */
export function toMarkdown(src) {
	return '```flow\n' + src + (src.endsWith('\n') ? '' : '\n') + '```\n';
}
