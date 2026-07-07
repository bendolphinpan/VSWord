// T-3.5b-flowseq.3c · js-sequence-diagrams fixture 清单（SSOT）。
//
// 每条 fixture 描述一份最小可渲染的 sequence 源码。
// - id     : 类别名，同时也是磁盘文件名（<id>.md / <id>.golden.svg）
// - tier   : 'P0'（首批 golden 覆盖；后续可扩 P1/P2）
// - src    : sequence 源码（会被包进 ```sequence ... ``` code block 写入 .md）
// - notes  : 可选说明
//
// 与 typora round-trip fixture (test/fixtures/roundtrip/typora/sequence-*.md) 语法一致。

export const SEQUENCE_FIXTURES = [
	{
		id: 'seq-basic',
		tier: 'P0',
		src: `title: Basic hello
Alice->Bob: Hi Bob
Bob-->Alice: Hello Alice`,
	},
	{
		id: 'seq-actors',
		tier: 'P0',
		src: `title: Auth flow
participant User as U
participant Server as S
participant Database as DB

U->S: POST /login
S->DB: SELECT user WHERE ...
DB-->S: row(id=42)
S-->U: 200 OK { token }`,
	},
	{
		id: 'seq-notes',
		tier: 'P0',
		src: `title: With notes
participant A
participant B
Note left of A: 客户端只做校验
A->B: 请求
Note right of B: 服务端命中缓存
B-->A: 响应
Note over A,B: 事务完成`,
	},
];

/** 把源码包成完整 md 内容（带 sequence code fence）。 */
export function toMarkdown(src) {
	return '```sequence\n' + src + (src.endsWith('\n') ? '' : '\n') + '```\n';
}
