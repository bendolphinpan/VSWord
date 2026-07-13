# RD-8 · Milkdown vendor lazy / gzip 审计

- **生成**：2026-07-13T11:03:00.396Z
- **vendor builtAt**：2026-07-13T10:45:24.850Z
- **Milkdown**：7.21.2

## 摘要

| 指标 | 值 |
|------|-----|
| stub index.js gzip | **383463** B（≈ 374 KiB） |
| vendor 全部 .js 数 | 91 |
| 全量 concat gzip -9 | **1319622** B（≈ 1289 KiB） |

## 按 category 汇总（gzip）

| category | files | gzip B |
|----------|------:|-------:|
| mermaid | 53 | 570739 |
| stub | 1 | 383463 |
| misc | 34 | 322539 |
| raphael | 1 | 33434 |
| sequence | 1 | 29880 |
| flowchart | 1 | 8482 |

## Top chunks

| file | gzip B | category |
|------|-------:|----------|
| index.js | 383463 | stub |
| chunk-HY2QOTCU.js | 113404 | misc |
| chunk-P6NXMQAN.js | 142000 | misc |
| chunk-ANIDRJMS.js | 77349 | mermaid |
| chunk-IYYZ5EOJ.js | 33819 | mermaid |
| chunk-NAEOPHBX.js | 42391 | mermaid |
| chunk-W3GVYYMS.js | 30994 | mermaid |
| chunk-XJCA4J6A.js | 35464 | mermaid |
| chunk-55LYHATG.js | 24498 | mermaid |
| chunk-6PR6WVW4.js | 33434 | raphael |
| chunk-OUJJ6HXZ.js | 22547 | mermaid |
| chunk-L767DLEE.js | 29880 | sequence |

## 建议（结论）

- **keep-mermaid-lazy** · `done` — mermaid / flowchart / sequence 已 dynamic import + splitting，首屏不内联全量图库
- **keep-pretext-lazy** · `done` — RD-5.2 @chenglou/pretext 为 lazy chunk（misc）
- **stub-is-milkdown-core** · `accept` — index.js stub gzip ≈ 374 KiB：Milkdown+PM+插件骨架，短期不可零成本压半
- **optional-prism-split** · `defer` — misc 大块可能含 Prism 语言包；可改为按语言 lazy，工作量中等，不阻塞发布
- **optional-katex-already-css** · `done-enough` — KaTeX CSS/fonts 已外置 vendor/katex/；JS 若在 stub 内则与 math NodeView 绑定，拆分收益有限
- **no-replace-gfm-for-size** · `wont` — 不为瘦身关掉 GFM table（产品对等优先；性能见 RD-1 分块）

## 下一步（非本卡必做）

1. 若 stub 仍涨：审计 entry 静态 import，避免把 demo/测试 util 打进主包
2. Prism 按语言 dynamic import（中等工时）
3. **不**为体积关闭 mermaid/GFM

**Gate RD-8**：审计报告落盘 + 确认图类 lazy 已生效；**不**要求本轮再砍 stub 50%。
