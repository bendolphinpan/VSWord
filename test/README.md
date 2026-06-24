# VSWord Test Workspace

仓库级测试 / 验证素材的统一入口。**与 code-oss 内置 unit test 互补**，专门承载主代理自动化能跑的端到端 round-trip、人工手测的 fixture 文件、以及每个阶段的人工 checklist。

## 目录结构

```
test/
├── README.md                         本文件
├── fixtures/                         真实 / 复杂 .mm / .md 等输入样例
│   └── mindmap/
│       └── complex-xmind.mm          含 arrowlink + richcontent + hook + 注释 + 未知属性 + 多嵌套
├── scripts/                          主代理可直接 node 跑的脚本
│   └── arrowlink-roundtrip.mjs       parse → mutate (append/update/remove) → write → re-parse 端到端
├── reports/                          脚本输出的 JSON / log，git-ignored 模式：进 git 仅作历史可追溯
└── YYYY-MM-DD-test.md                每次阶段性验证的人工 checklist
```

## 怎么跑自动化部分（主代理）

前置：`code-oss/` 必须先编译过（`out/` 存在）：

```bash
cd code-oss && /c/Program\ Files/nodejs/npm.cmd run compile
```

然后从仓库根：

```bash
node test/scripts/arrowlink-roundtrip.mjs
```

退出码 0 = 全部 round-trip 通过；非 0 = 看 stdout/stderr 报告失败用例。

## 人工 checklist

按日期生成的 `YYYY-MM-DD-test.md` 列出 SVG 交互 / 视觉 / 折叠回退 等主代理无法自动化的项，请在 code-oss 启动后逐项勾选。
