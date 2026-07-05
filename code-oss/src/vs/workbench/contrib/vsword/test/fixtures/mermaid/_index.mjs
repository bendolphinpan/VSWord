// T-3.5b.5 · Mermaid 22 类 fixture 清单（SSOT）。
//
// 每条 fixture 描述一份最小可渲染的 mermaid 源码。
// - id     : 类别名，同时也是磁盘文件名（<id>.md / <id>.expected.svg）
// - tier   : 'GA' | 'beta'（mermaid@11.14 状态；sankey 已 GA 但保留 -beta 语法）
// - src    : mermaid 源码（会被包进 ```mermaid ... ``` code block 写入 .md）
// - notes  : 可选说明（不进 diff，仅供人读）
//
// 用 mjs 而非 json：允许含反引号 / 换行 / 注释，且 gate-f、selfcheck、fixture-bootstrap
// 三方共享同一份定义，避免 22 类源码抄成三份。

export const MERMAID_FIXTURES = [
	// —— GA / 稳定（15 条）————————————————————————————————————————————
	{ id: 'flowchart',           tier: 'GA', src: `flowchart LR\n  A --> B --> C` },
	{ id: 'sequenceDiagram',     tier: 'GA', src: `sequenceDiagram\n  Alice->>Bob: hi\n  Bob-->>Alice: hi` },
	{ id: 'classDiagram',        tier: 'GA', src: `classDiagram\n  class Animal {\n    +String name\n    +eat()\n  }` },
	{ id: 'stateDiagram-v2',     tier: 'GA', src: `stateDiagram-v2\n  [*] --> Still\n  Still --> [*]` },
	{ id: 'erDiagram',           tier: 'GA', src: `erDiagram\n  CUSTOMER ||--o{ ORDER : places` },
	{ id: 'journey',             tier: 'GA', src: `journey\n  title Buy\n  section Search\n    Go: 5: Me` },
	{ id: 'gantt',               tier: 'GA', src: `gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section A\n  Task :a1, 2024-01-01, 3d` },
	{ id: 'pie',                 tier: 'GA', src: `pie title Vote\n  "A" : 40\n  "B" : 60` },
	{ id: 'quadrantChart',       tier: 'GA', src: `quadrantChart\n  title Reach vs Engagement\n  x-axis Low --> High\n  y-axis Low --> High\n  quadrant-1 Do first\n  quadrant-2 Schedule\n  quadrant-3 Delegate\n  quadrant-4 Drop\n  Campaign A: [0.3, 0.6]` },
	{ id: 'requirementDiagram',  tier: 'GA', src: `requirementDiagram\n  requirement r1 {\n    id: 1\n    text: rule\n    risk: high\n    verifymethod: test\n  }` },
	{ id: 'gitGraph',            tier: 'GA', src: `gitGraph\n  commit\n  branch dev\n  commit\n  checkout main\n  merge dev` },
	{ id: 'C4Context',           tier: 'GA', src: `C4Context\n  title System\n  Person(user, "User")\n  System(sys, "App")\n  Rel(user, sys, "uses")` },
	{ id: 'mindmap',             tier: 'GA', src: `mindmap\n  root((root))\n    A\n    B` },
	{ id: 'timeline',            tier: 'GA', src: `timeline\n  title History\n  2020 : Start\n  2024 : Now` },
	{ id: 'sankey-beta',         tier: 'GA', src: `sankey-beta\n\nA,B,10\nA,C,5\n`, notes: 'v11 已 GA，语法保留 -beta 别名' },

	// —— beta / v11 新（7 条）————————————————————————————————————————
	{ id: 'xychart-beta',        tier: 'beta', src: `xychart-beta\n  title "Sales"\n  x-axis [jan, feb, mar]\n  y-axis "Rev" 0 --> 100\n  bar [30, 50, 80]\n  line [30, 50, 80]` },
	{ id: 'block-beta',          tier: 'beta', src: `block-beta\n  columns 3\n  a b c\n  d e f` },
	{ id: 'packet-beta',         tier: 'beta', src: `packet-beta\n  0-15: "Source Port"\n  16-31: "Dest Port"` },
	{ id: 'kanban',              tier: 'beta', src: `kanban\n  todo\n    [Task A]\n  doing\n    [Task B]\n  done\n    [Task C]` },
	{ id: 'architecture-beta',   tier: 'beta', src: `architecture-beta\n  group api(cloud)[API]\n  service db(database)[DB] in api\n  service web(server)[Web] in api\n  web:R --> L:db` },
	{ id: 'radar-beta',          tier: 'beta', src: `radar-beta\n  title Skills\n  axis a["A"], b["B"], c["C"]\n  curve x["X"]{5, 6, 7}\n  max 10\n  min 0` },
	{ id: 'treemap-beta',        tier: 'beta', src: `treemap-beta\n  "Root"\n    "A": 10\n    "B": 20` },
];

/** 把源码包成完整 md 内容（带 mermaid code fence）。 */
export function toMarkdown(src) {
	return '```mermaid\n' + src + (src.endsWith('\n') ? '' : '\n') + '```\n';
}
