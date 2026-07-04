// fixtures/diagrams.mjs
// 22 类图各一条最小 fixture（对齐 mermaid v11 官方文档，2026-07 状态）。
// GA 15 类 + beta/v11 7 类；名称与官方分类严格一致。

export const FIXTURES = [
	// —— GA / 稳定 ————————————————————————————————————————————————
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
	{ id: 'sankey-beta',         tier: 'GA', src: `sankey-beta\n\nA,B,10\nA,C,5\n` }, // v11: sankey 已 GA 但保留 -beta 语法
	// —— v11 beta / 新增 ————————————————————————————————————————————
	{ id: 'xychart-beta',        tier: 'beta', src: `xychart-beta\n  title "Sales"\n  x-axis [jan, feb, mar]\n  y-axis "Rev" 0 --> 100\n  bar [30, 50, 80]\n  line [30, 50, 80]` },
	{ id: 'block-beta',          tier: 'beta', src: `block-beta\n  columns 3\n  a b c\n  d e f` },
	{ id: 'packet-beta',         tier: 'beta', src: `packet-beta\n  0-15: "Source Port"\n  16-31: "Dest Port"` },
	{ id: 'kanban',              tier: 'beta', src: `kanban\n  todo\n    [Task A]\n  doing\n    [Task B]\n  done\n    [Task C]` },
	{ id: 'architecture-beta',   tier: 'beta', src: `architecture-beta\n  group api(cloud)[API]\n  service db(database)[DB] in api\n  service web(server)[Web] in api\n  web:R --> L:db` },
	{ id: 'radar-beta',          tier: 'beta', src: `radar-beta\n  title Skills\n  axis a["A"], b["B"], c["C"]\n  curve x["X"]{5, 6, 7}\n  max 10\n  min 0` },
	{ id: 'treemap-beta',        tier: 'beta', src: `treemap-beta\n  "Root"\n    "A": 10\n    "B": 20` },
];
