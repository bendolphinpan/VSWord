# Decision 0005 · RD-4 模式正交 UI 收尾对账

- **日期**：2026-07-13  
- **状态**：✅ 关闭  
- **关联**：`003-phase3-mode-orthogonality.md` · `004` RD-4 · T-3.12.3.a/b · **T-3.13.2/3**

---

## 1. 权威语义（现行，非 003 v2 原文一字不动）

| 来源 | 角色 |
|------|------|
| `003-phase3-mode-orthogonality.md` v2 | 初定：两级 radio；**阅读下隐藏二级** |
| **T-3.13.2**（commit `b2b242c8`） | **现行**：阅读下 **保留** 二级 `normal/focus/typewriter` 并生效 |
| T-3.13.3 | Focus 装饰 = cursor 行 ∪ hover 行（≤2） |
| 代码 | `mode-controller` / `mode-switch` / `focus-mode` / `milkdownEditorHtml` |

**拍板结论（对账采用）**：以 **T-3.13.2 起实现 + 单测** 为准；003 §4 M-4 / §6 AC-1～AC-2「阅读隐藏二级」**作废**，由「reading × 三档 substyle」取代。

---

## 2. 目标矩阵对账（现行 9 格）

| # | mode | substyle | 二级菜单 | shell `data-substyle` | 视觉 | 单测 |
|---|------|----------|----------|------------------------|------|------|
| M-1 | realtime | normal | 可见 | normal | 默认 WYSIWYG | ✅ viewModes |
| M-2 | realtime | focus | 可见 | focus | 段 dim | ✅ |
| M-3 | realtime | typewriter | 可见 | typewriter | 光标居中 | ✅ + T-3.13.4 |
| M-4 | reading | normal | **可见** | normal | 只读 · 无 dim | ✅ T-3.13.2 |
| M-5 | reading | focus | **可见** | focus | 只读 + dim | ✅ |
| M-6 | reading | typewriter | **可见** | typewriter | 只读 + recenter | ✅ |
| M-7 | source | normal | 可见 | normal | textarea | ✅ |
| M-8 | source | focus | 可见 | focus 透传 | 选中无 PM 装饰 | ✅ |
| M-9 | source | typewriter | 可见 | typewriter 透传 | 选中无 recenter | ✅ |

与 003 v2 的 7 格差异：**阅读从 1 格扩为 3 格**（M-4/5/6）。

---

## 3. AC 对账

| AC（003 §6） | 现行 | 证据 |
|--------------|------|------|
| AC-1 阅读隐藏二级 | ❌ 废 · 改 **显示且三档生效** | T-3.13.2 · mode-switch no-op visibility |
| AC-2 切回实时恢复 substyle | ⚠️ 简化：reading 期间即直通 stored，切回无需「恢复」 | viewModes 「leaving reading」 |
| AC-3 Focus/Typewriter 互斥 | ✅ | viewModes setSubstyle radio |
| AC-4 源码二级可见、视觉不生效 | ✅ | viewModes source 透传 |
| AC-5 memento 迁移 | ✅ | viewModes migration 4 起始态 |
| AC-6 reading typewriter legacy fallback 移除 | ✅ | focus-mode `typewriterEnabled` 仅读 `data-substyle` |

快捷键（§5.2）：

| 键 | realtime | reading | source |
|----|----------|---------|--------|
| Ctrl+Shift+F/T | 切 substyle | **同样切**（T-3.13.2） | no-op |

---

## 4. 子任务 / 测试 Gate

| 卡 | 状态 |
|----|------|
| T-3.12.3.a 状态机 + 迁移 | ✅ |
| T-3.12.3.b UI radiogroup | ✅ → 再经 T-3.13.2 改 visibility |
| T-3.12.3.c 单测 | ✅ `viewModes` 37 + `modeSwitch` 8 + typewriter/editable 相关 |
| `viewModeMatrix.test.ts` | **整 suite pending**（旧 3×2×2 双 toggle 矩阵，已被 substyle 取代） |

### 本机回归（2026-07-13）

```text
run-view-modes-test.mjs              → 37 passing
run-mode-switch-component-test.mjs   → 8 passing
run-view-mode-editable-test.mjs      → 7 passing
run-view-mode-matrix-test.mjs        → 0 passing / 7 pending（已知陈旧，不阻塞）
```

---

## 5. RD-4 关闭判定

| 子项 | 结论 |
|------|------|
| RD-4.1 §7 对账 | ✅ 本文 §2–3 |
| RD-4.2 缺测 | ✅ 核心覆盖在 viewModes；matrix suite 标注陈旧即可，**不**重写 12 组合 |
| RD-4.3 关 U-4 | ✅ 功能闭合；视觉精修仍归 UI 布局阶段 |

**非目标**：重做 mode UI 皮肤、给 reading 加过渡动画。

---

## 6. 修订

| 日期 | 说明 |
|------|------|
| 2026-07-13 | 首建：T-3.13.2 覆盖 003 v2 阅读隐藏条款；RD-4 关闭 |

**Decision End · 0005**
