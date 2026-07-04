# Spike 报告 · T-3.5b.1 Mermaid 集成探路 + 22 类兼容摸底

> 时间：2026-07-04
> 作者：dev (Full-stack Agent)
> Kanban：t_9b1e7070
> 承接 PRD：`docs/plans/003b-mermaid.md` v1（决策锁：Q1=a / Q2=b / Q3=a / Q4=c / Q5=c）
> 交付物：本报告 + `probe.mjs` / `fixtures.mjs` / `report.json` 原始数据 + 本目录 `node_modules/mermaid`（本地 spike 用，不入 vendor）

## TL;DR（三行）

1. **Mermaid v11.14.0 ESM 版本在 CSP 层完全可行**：`mermaid.core.mjs` / `mermaid.esm.min.mjs` / `mermaid.esm.mjs` 三个 ESM 入口的 bundle 里 `eval` / `new Function` / `Function("...")` 全为 0，与现有 webview CSP（`script-src ${cspSource}`，无 `unsafe-eval`）兼容；**UMD 版 `mermaid.min.js` 检出 2 处 `Function("...")` 直构造，禁用**。
2. **22 类 fixture 在 jsdom + SVG/canvas stub 环境下 22/22 render 成 svg**（决策锁 Q5=c 的\"全 22 类 P0 全绿\"目标可达），首次动态 import ≈ 730 ms（Node + 冷缓存），单图 render 20–730 ms（flowchart 冷启动 700+，其余稳定在 20–130 ms）。
3. **NodeView 可以 90% 复用 T-3.9 math-view 骨架**（点击 → textarea + live preview + Esc/Ctrl+Enter + stopEvent/ignoreMutation），差异集中在\"value 存放位置\"和\"渲染是异步 Promise\"两点，见 §5。

## 1. mermaid npm 包摸底

| 指标 | 值 |
|---|---|
| 版本 | `mermaid@11.14.0` |
| 主入口（package.json `module`） | `dist/mermaid.core.mjs` |
| ESM 主入口 raw / gzip | **45 712 B / 11 083 B** |
| ESM 压缩入口 `mermaid.esm.min.mjs` raw / gzip | **27 199 B / 10 247 B** |
| ESM 完整 `mermaid.esm.mjs` raw / gzip | 57 507 B / 14 215 B |
| UMD `mermaid.min.js` raw / gzip | 3 164 970 B / 876 604 B（**不用**） |
| dist 目录全部 .m?js 汇总（chunks 目录+入口） | 44 文件 · raw 10.6 MB · gzip 2.1 MB |

**关键观察 —— dist 内是"入口 + 上百个懒加载 chunks"**：`mermaid.core.mjs` 里有 **31 处 `import()`**，实际的图类型代码分散在 `dist/chunks/` 与 `dist/diagrams/**`。这就是为什么主入口只有 11 KB gzip —— **mermaid 自身已经是"完全懒加载"结构**（对齐 Q2=b）。落地时的 chunk 数量策略见 §3。

## 2. 22 类图类型兼容表

跑法：`node probe.mjs`，jsdom + SVG 度量 stub（真实 webview 全带原生实现），逐类调用 `mermaid.render()` 断言 svg 长度 > 0。

原始数据：`report.json` `.fixtures[]`。

| # | 图类型 | 结果 | 耗时 (ms) | svg 尺寸 (bytes) | 备注 |
|---|---|---|---|---|---|
| 1 | flowchart | ✅ | 731.5 | 15 037 | 首个图冷启动，含 dagre / cytoscape 分包懒加载 |
| 2 | sequenceDiagram | ✅ | 61.8 | 23 212 | v10 曾用 `Function` 已在 v11 移除，本 spike CSP 扫描 0 命中 |
| 3 | classDiagram | ✅ | 103.9 | 17 557 |  |
| 4 | stateDiagram-v2 | ✅ | 63.8 | 27 897 |  |
| 5 | erDiagram | ✅ | 51.2 | 9 473 |  |
| 6 | pie | ✅ | 273.5 | 4 034 |  |
| 7 | gantt | ✅ | 37.6 | 8 964 |  |
| 8 | journey | ✅ | 27.9 | 8 187 |  |
| 9 | gitGraph | ✅ | 48.6 | 9 553 |  |
| 10 | mindmap | ✅ | 263.1 | 24 658 | 需 canvas 2D measureText（webview 原生支持） |
| 11 | timeline | ✅ | 31.4 | 13 558 |  |
| 12 | quadrantChart | ✅ | 24.6 | 5 413 | GA |
| 13 | requirementDiagram | ✅ | 49.9 | 10 315 |  |
| 14 | C4 | ✅ | 30.1 | 19 834 | 需全局 `screen`，webview 天然带 |
| 15 | xychart-beta | ✅ | 30.2 | 7 196 |  |
| 16 | block-beta | ✅ | 49.6 | 8 199 |  |
| 17 | packet-beta | ✅ | 20.1 | 3 618 |  |
| 18 | kanban-beta | ✅ | 47.3 | 18 904 | 语法已变（`Todo` 顶层区 + `[Task1]@{...}`），fixture 需 v11 新语法 |
| 19 | sankey-beta | ✅ | 24.7 | 4 135 |  |
| 20 | architecture-beta | ✅ | 132.6 | 9 192 | 内部用 cytoscape，需 canvas 2D |
| 21 | radar-beta | ✅ | 33.7 | 7 843 | 语法：`axis a["A"], ...` / `curve me["Me"]{...}` |
| 22 | treemap-beta | ✅ | 68.4 | 6 072 |  |

**结论**：22/22 全绿。**没有任何图类型需要在 VSWord 侧做白名单屏蔽**。

> 关于 jsdom 环境的注意点：`getBBox` / `getComputedTextLength` / canvas 2D 是 jsdom 不实现的 —— 全部由 spike 里的 stub 补上，让"引擎/CSP 级失败"与"jsdom 环境失败"区分开。真实 webview（Chromium）三者原生完备。首轮跑没打 stub 时 22 类只过 5 类，几乎所有失败信号都是 `getBBox is not a function`，属于测试环境噪声，不代表 mermaid 不兼容。

## 3. 懒加载可行性

### 3.1 首屏体积
- **entry 主入口 `mermaid.core.mjs`：gzip 11 KB**，完全在 PRD §7 定的 30 KB 增量预算内。
- 具体图类型代码在 `dist/chunks/*.mjs`（多达 40+ 文件），由 mermaid 内部 `import()` 触发；**只有当用户文档里出现对应图类型时**，浏览器才请求那个 chunk。

### 3.2 首次渲染耗时
- 冷启：动态 import 主入口 728 ms（Node + 磁盘首读，webview 走 http 静态资源应更快），首个 flowchart render 731 ms。
- 热启：命中 module cache 后，同图类型 render 稳定在 20–130 ms。用户可感知延迟仅在\"首个图\"上。
- **落地建议**：F-06 懒加载 + R-2 缓解策略里的\"idle 预热\"确实有价值 —— 首屏之后 `requestIdleCallback → import('mermaid')` 预热，等用户滚到第一个图时几乎无感。

### 3.3 CSP 兼容性（关键 §）
静态扫描 mermaid ESM 三个入口的源码字符串：

| 入口 | eval() | new Function | Function("...") | dynamic import() | innerHTML= | 结论 |
|---|---|---|---|---|---|---|
| mermaid.core.mjs | 0 | 0 | 0 | 31 | 3 | ✅ CSP 兼容 |
| mermaid.esm.min.mjs | 0 | 0 | 0 | 31 | 3 | ✅ CSP 兼容 |
| mermaid.esm.mjs | 0 | 0 | 0 | 31 | 3 | ✅ CSP 兼容 |
| **mermaid.min.js (UMD)** | 0 | 0 | **2** | 0 | 9 | ❌ **禁用** |

**现有 webview CSP**（`milkdownEditorHtml.ts:45`）：
```
default-src 'none';
img-src ${cspSource} https: data: blob:;
font-src ${cspSource} data:;
style-src ${cspSource} 'unsafe-inline';
script-src ${cspSource};
```

**结论**：
1. 用 `dist/mermaid.core.mjs`（package.json `module` 字段默认解析到这里），**无需放开 `script-src 'unsafe-eval'`**。
2. 只在 fixture 里明确\"用 ESM 入口，不引 UMD\"—— 已经是 npm 默认，落地时无需额外配置。
3. mermaid 内部 3 处 `innerHTML=` 全部用于往自建 detached DOM 注入 SVG 字符串，不接触外部输入，符合 XSS 语义边界（且 mermaid 默认 `securityLevel: 'strict'` 会 sanitize 用户输入）。
4. **动态 `import()` 需 webview 侧允许**：现有 CSP `script-src ${cspSource}` 会自动允许同源 chunk。落地时需保证 mermaid 的所有 chunk 文件都在 `localResourceRoots` 白名单内（走 `vendor/mermaid-chunks/` 或类似路径），并且 esbuild build 时 `splitting: true` + `format: 'esm'` + 保持相对 URL —— 具体在 T-3.5b.5 的构建脚本里处理。

## 4. NodeView 复用摸底（对照 T-3.9 math-view）

结论：**能复用主结构，需改动 5 处**。

### 4.1 直接搬（相同 pattern）
- 双层 DOM：`.vsword-math-block` 外壳 + `.vsword-math-preview`（图渲染） + `.vsword-math-editor > textarea + .vsword-math-error`（可折叠源码区）
- `stopEvent(e) { return editing && editor.contains(e.target) }` + `ignoreMutation() { return true }` —— 原子节点 + 交互子内容 pattern，直接照搬
- 交互：preview click → enterEdit / textarea input → live render / Esc → cancel / Ctrl+Enter+blur → commit
- 错误 UI：try/catch + `errBar.textContent = err`，dom.classList.toggle('has-error')

### 4.2 需要改的 5 处

| # | 差异点 | math-view 现状 | mermaid 需改 |
|---|---|---|---|
| **D-1** | 值存放位置 | `node.attrs.value`（math_block） / text children（math_inline） | `node.textContent`（`code_block` schema 用 text 节点承载源码），`attrs.params` 里的 `language === 'mermaid'` |
| **D-2** | commit 时 tr 构造 | `tr.setNodeMarkup(pos, null, { ...attrs, value: next })` | `tr.replaceWith(pos+1, pos+1+node.content.size, schema.text(next))`（替换 text children，保持 code_block wrap 不变，等价于 tracker 视角下的\"改内容不改结构\"） |
| **D-3** | render 是否异步 | KaTeX `katex.render(target, ...)` 同步返回 | mermaid `await mermaid.render(id, src)` 返回 Promise `{ svg, bindFunctions? }`，需 `renderSeq` 序号避免过时的 svg 覆盖新的 |
| **D-4** | 依赖加载 | KaTeX 在 entry.template.js 就 `import katex`，同步就绪 | mermaid 走 `let mermaidPromise; async function ensureMermaid() { return mermaidPromise ??= import('mermaid') }`，首次 mount 触发；`ensureMermaid()` 结果缓存 |
| **D-5** | 空块占位 | 单文本 hint `空数学 — 点击编辑` | 需辨别\"真正空\"vs\"只有换行\"；mermaid 空块直接 render 会 parseError，走 F-04 通道；显式短路：`if (!source.trim()) show 占位` |

### 4.3 拦截 code-block-chrome
`code-block-chrome.template.js` 会给所有 `code_block` 装饰（Prism 高亮 + 语言选择 + 复制按钮）。mermaid 块也是 `code_block[lang=mermaid]`，会被二次装饰。落地必须在 `code-block-chrome.mjs` 里加：
```js
if (node.attrs.language === 'mermaid') return null; // 让位给 mermaid-view
```
这条在 T-3.5b.2 实现时必须先做，不然 chrome 会包裹 mermaid NodeView，交互冲突。

### 4.4 复用代码量估算
math-view.template.js 310 行 + helpers 78 行 = 388 行。mermaid-view 参照 T-3.5b.2 交付物预估 350–400 行 helpers 独立（`mermaidThemeMap.mjs` / `mermaidLoader.mjs`），主 view 单文件 ≤ 300 行。**符合 PRD §8 "≤ 400 行" 硬指标**。

## 5. 主题联动摸底

### 5.1 mermaid 侧 API
- `mermaid.initialize({ theme: 'default' | 'dark' | 'forest' | 'neutral' | 'base' })` 是**全局**设置，改完只影响\"之后\" render 的图。
- 已渲染图**不会**自动重刷 —— 必须**重跑 render**（这是 R-3 卡点）。
- **per-render 覆盖存在且可用**：mermaid 支持每张图源码内前缀 `%%{init: {'theme':'dark'}}%%` frontmatter 做 per-diagram 主题覆盖。`theme-switch.mjs` 已验证 —— default vs initDark 输出 svg 尺寸 10 313 vs 10 748，背景色 `hsl(80, 100%, 96%)` → `hsl(20, 1.6%, 12%)`，明显不同。**结论：我们不必依赖\"改 initialize 再 render\"，可以在 render 前把 frontmatter 直接拼到源码前面，避免全局副作用**。落地时更清爽。
- 批量重渲测量（`reports/theme-switch.json`）：10 张图批量 dark 重渲 300 ms（30 ms/张），50 张图批量 dark 重渲 1 286 ms（25.7 ms/张）—— **50 张图切主题会明显卡 1.3 s**，必须走 §5.3 的分批渲染。

### 5.2 Code OSS 主题事件
- Code OSS 主题服务：`IThemeService.onDidColorThemeChange`（`vs/platform/theme/common/themeService.ts`），在 host 侧订阅。
- 现有 vsword 已有 `themeChanged` 消息通道（`entry.template.js:445-454`），host 侧 push `{ type: 'themeChanged', theme: 'default' | 'dark' }`，webview 侧 body[data-theme] 切换。这个通道**可直接复用**，把 payload 里再加一个 mermaid 主题字段：`{ type: 'themeChanged', theme: 'default'|'dark', mermaidTheme: 'default'|'dark' }`（或统一映射，写死 default↔default / dark↔dark，对齐 Q3=a）。

### 5.3 重渲染成本估算
- 单图 render 稳态 20–130 ms（§2），主题切换实测 50 张图 1 286 ms（`reports/theme-switch.json` 已固定）。文档里 50 张图 → 切主题会明显卡 ~1.3 s。
- **落地策略**（PRD §R-3）：
  1. 主题切换事件到达 → 遍历所有 mermaid NodeView，标记 `dirty=true`
  2. 用 `IntersectionObserver` 挂在 NodeView.dom 上，**仅可视范围内的图立即 re-render**
  3. 不可视图在 IntersectionObserver 触发 `isIntersecting=true` 时懒重渲
  4. 全部走 `requestAnimationFrame` 队列，每帧最多 3–5 张，避免连击
- 备选：走 §5.1 的\"frontmatter per-render 覆盖\"策略 —— render 前给每张图源码拼 `%%{init: {'theme':'<主题>'}}%%`，配 debounce 300 ms + 分批渲染（每帧 5 张），与 PRD 一致。**推荐把两种组合起来**：per-render frontmatter（避免全局 initialize 副作用）+ IntersectionObserver 懒重渲（避免一次性刷全部）。

## 6. 方向性判断（无阻塞）

**没有发现 CSP / webview 层的方向性障碍**。全部 22 类图类型可跑通，动态 import chain 与现有 CSP 完全兼容，NodeView 可复用主流程。可以进入 T-3.5b.2 实施阶段。

**唯一需要 PM 关注的\"落地策略\"级取舍**（不阻塞 spike，写下来备案）：
- Q5=c 决策锁要求\"22 类 fixture 全绿\"，本 spike 已在 jsdom + stub 下验完；**真机 fixture 单测应该在 vsword 现有 mocha 环境跑**（`test/node/`，jsdom 已配好 stub 或直接借 Electron 环境）。落地建议：把本目录 `fixtures.mjs` 内容抽成 `code-oss/src/vs/workbench/contrib/vsword/test/fixtures/mermaid-22.json`，做一份 22 类 md fixture，让 T-3.5b.5 单测直接消费。
- 若后续因 UMD 意外要用（不太可能），必须先解决 Function() 构造 —— **PRD 已把\"不用 UMD\"作为默认，可不改**。

## 7. 交付物清单

- `docs/spikes/T-3.5b.1-mermaid/` 目录（本 spike 全部产物）
  - `README.md`（本报告）
  - **本报告主用**：
    - `probe.mjs`（22 类 render + CSP scan + 尺寸测量一体脚本）
    - `fixtures.mjs`（22 类最小合法 fixture，v11 语法）
    - `report.json`（probe 生成的原始数据）
  - **交叉验证副脚本**（同结论，可独立复跑，方便审计）：
    - `render-all.mjs` + `fixtures/diagrams.mjs` → `reports/render-22.json`（22/22 全绿，与 report.json 一致）
    - `measure-bundle.mjs` → `reports/bundle.json`（chunks/mermaid.core/ 每 chunk 逐个 raw+gzip 尺寸）
    - `scan-csp.mjs` → `reports/csp-scan.json`（更细粒度 CSP 关键字扫描）
    - `theme-switch.mjs` → `reports/theme-switch.json`（per-render 主题覆盖验证 + 10/50 张图切主题耗时）
  - `package.json` + `package-lock.json`（本地隔离依赖）
  - `node_modules/`（.gitignore，不入版控）

## 8. 下一步（送 PM/dev 排期）
1. T-3.5b.2 NodeView 实施（≤400 行，pattern 复用 math-view，5 处差异见 §4.2）
2. T-3.5b.5 构建脚本改 `build-milkdown-editor.cjs`：把 `mermaid@11.14.0` 加入 packages，esbuild `splitting: true` 走 esm，vendor 里出 mermaid chunk 目录 + `localResourceRoots` 白名单
3. 22 类 md fixture 移植到 `test/fixtures/mermaid/` 作为 AC-8 单测输入
4. T-3.5b.4 主题桥：`themeChanged` 消息 payload 加 `mermaidTheme` 字段（default/dark 硬映射），webview 侧 IntersectionObserver 懒重渲

**Spike 结束，无阻塞问题需 PM 拍板**。
