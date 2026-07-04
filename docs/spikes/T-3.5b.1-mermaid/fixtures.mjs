// 22 类 fixture 最小样例（对齐 mermaid v11 官方文档最新分类）
// 每条尽量小到刚好合法，用来测"能否 render 出 svg"。
export const fixtures = [
	// ---- GA 稳定 ----
	['flowchart', `flowchart LR
  A[Start] --> B{Fork}
  B -->|yes| C[End]
  B -->|no| D[Loop]
  D --> B`],
	['sequenceDiagram', `sequenceDiagram
  participant Alice
  participant Bob
  Alice->>Bob: hello
  Bob-->>Alice: hi`],
	['classDiagram', `classDiagram
  class Animal {
    +String name
    +eat()
  }
  Animal <|-- Dog`],
	['stateDiagram-v2', `stateDiagram-v2
  [*] --> Idle
  Idle --> Running: start
  Running --> [*]: stop`],
	['erDiagram', `erDiagram
  USER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains`],
	['pie', `pie title Pets
  "Dogs" : 386
  "Cats" : 85
  "Rats" : 15`],
	['gantt', `gantt
  title Roadmap
  section A
  task1 :a1, 2026-01-01, 30d
  task2 :after a1, 20d`],
	['journey', `journey
  title My day
  section Morning
    Coffee: 5: Me
    Read: 3: Me`],
	['gitGraph', `gitGraph
  commit
  branch dev
  commit
  checkout main
  merge dev`],
	['mindmap', `mindmap
  root((root))
    A
      A1
    B`],
	['timeline', `timeline
  title History
  2020 : Alpha
  2021 : Beta`],
	['quadrantChart', `quadrantChart
  title Reach vs engagement
  x-axis Low --> High
  y-axis Low --> High
  quadrant-1 Q1
  quadrant-2 Q2
  quadrant-3 Q3
  quadrant-4 Q4
  Campaign A: [0.3, 0.6]`],
	['requirementDiagram', `requirementDiagram
  requirement R1 {
    id: 1
    text: must do stuff
  }
  element E1 {
    type: simulation
  }
  E1 - satisfies -> R1`],
	['C4', `C4Context
  title C4 sample
  Person(user, "User")
  System(s, "System", "does things")
  Rel(user, s, "uses")`],
	['xychart-beta', `xychart-beta
  title Sales
  x-axis [jan, feb, mar]
  y-axis "USD" 0 --> 100
  bar [50, 60, 40]`],
	// ---- beta / v11 新增 ----
	['block-beta', `block-beta
  columns 2
  A B
  C D`],
	['packet-beta', `packet-beta
  0-15: "src port"
  16-31: "dst port"`],
	['kanban-beta', `kanban
  Todo
    [Task1]@{ assigned: 'me' }
  Doing
    [Task2]@{ assigned: 'you' }`],
	['sankey-beta', `sankey-beta
A,B,10
B,C,5`],
	['architecture-beta', `architecture-beta
  group api(cloud)[API]
  service db(database)[DB] in api
  service web(server)[Web] in api
  web:R --> L:db`],
	['radar-beta', `radar-beta
  title Skills
  axis a["A"], b["B"], c["C"], d["D"]
  curve me["Me"]{3, 4, 2, 5}
  max 5
  min 0`],
	['treemap-beta', `treemap-beta
"root"
  "A": 10
  "B": 20`],
];
