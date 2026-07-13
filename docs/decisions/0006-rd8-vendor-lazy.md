# Decision 0006 · RD-8 vendor lazy / bundle 策略

- **日期**：2026-07-13  
- **状态**：✅ 审计完成 · 大拆分延后  
- **关联**：`004` RD-8 · `code-oss/test/reports/rd-8-vendor-audit.md`（脚本生成）

---

## 1. 现状

| 能力 | 状态 |
|------|------|
| esbuild `splitting: true` | ✅ |
| mermaid / flowchart / sequence dynamic import | ✅ lazy chunks |
| Pretext（RD-5.2） | ✅ lazy |
| KaTeX CSS + fonts | ✅ 外置 `vendor/katex/` |
| 首屏 stub（index.js） | 仍大（Milkdown + PM 核心，~370+ KiB gzip 量级，以当次审计为准） |

---

## 2. 决策

| 项 | 结论 |
|----|------|
| 本卡是否必须再砍 stub 50% | **否** — 阻塞项不在此 |
| 图类 lazy | **保持**，禁止改回静态全量 |
| Prism 按语言 lazy | **可后续**，不阻塞 RD-10 |
| 为体积关 GFM table / mermaid | **不做** |

---

## 3. 复现

```bash
node code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/build-milkdown-editor.cjs
node code-oss/test/scripts/rd-8-vendor-audit.mjs
```

---

## 4. 修订

| 日期 | 说明 |
|------|------|
| 2026-07-13 | 审计脚本 + 本决策：accept stub，defer Prism 再拆 |

**Decision End · 0006**
