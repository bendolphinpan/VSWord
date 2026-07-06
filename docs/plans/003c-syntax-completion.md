# PRD · 模块 c · 语法补齐（T-3.5c）

> **文档定位**：Phase 3 模块 c（Typora / Obsidian 兜底语法补齐）产品需求文档 v1。
> 承接：模块 a Round-trip 保真层 ✅（HEAD `2f93e63c..bd7cdc1e`）+ 模块 b Mermaid ✅（HEAD `08277a0c`）。
> **作者**：PM Agent
> **创建**：2026-07-05
> **前置**：模块 a / 模块 b 已 push `origin/dev`。
> **命名**：本模块所有子任务用 `T-3.5c.N`，与 plan 主表 T-3.4/T-3.5b 平级但独立分支号；PRD 明确废弃 body 里的 "T-3.5c.N 建议 4-6 个" 的模糊描述，锁定 6 个子任务。

---

## 1. 背景

- VSWord 是 Code-OSS fork 里的 Milkdown 富文本编辑器，Markdown 是唯一持久层格式（`code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/`）。
- 已有 Milkdown 基础语法族：
  - **commonmark**：heading（ATX 已工作 · setext 只解析不写回）· paragraph · list · blockquote · code_block · emphasis · strong · link · image · thematic_break · hard-break · HTML block（原文透传）
  - **gfm preset**：table · strikethrough（`~~text~~`）· task list（`- [x]`）· autolinks（bare URL）· GFM footnotes（未接入 UI）
  - **VSWord 自研 mark/schema**：highlight `==text==`（T-3.3.7 `highlight.template.js`）· underline `<u>...</u>`（T-3.3.7 `underline.template.js`）
  - **VSWord NodeView**：math_block + math_inline（T-3.9 `math-view.template.js`）· mermaid（模块 b `mermaid-view.template.js`）· wikilinks + autocomplete + preview + backlinks（T-3.11.1~4）
- **可复用 pattern**：
  - `$markSchema + $remark + $inputRule + $useKeymap` 四件套 — highlight/underline 已跑通（inline 装饰族参照物）
  - `math-view` 点击预览 + textarea 编辑 + Esc/Ctrl+Enter commit — 元数据块（frontmatter）参照物
  - `roundtrip/blockIdAllocator.ts` + `roundtrip-tracker.template.js`（T-3.8）— 任何新块的 Round-trip 契约参照
- Milkdown vendor：`@milkdown/*@7.21.2` ESM bundle；`.tmp/milkdown-prod-builder/package.json` 已有 `unist-util-visit@5`。
- **Round-trip 硬约束**：模块 a 已定义 byte-for-byte 保真契约（未编辑块 unchanged）。本模块**必须**接入 `roundtrip-tracker` 通道，不得引入未 track 的自定义节点。

---

## 2. Gap 表（Typora / Obsidian / Milkdown 官方 / VSWord 现状）

| 语法特性 | Typora | Obsidian | Milkdown 官方 | VSWord 现状 | 结论 |
|---------|:------:|:--------:|:-------------:|-------------|------|
| strikethrough `~~x~~` | ✅ | ✅ | ✅（gfm） | ✅ 已落地 | 无需做 |
| task list `- [x]` | ✅ | ✅ | ✅（gfm） | ✅ 已落地 | 无需做 |
| autolinks（bare URL） | ✅ | ✅ | ✅（gfm） | ✅ 已落地 | 无需做 |
| hard line break（2 空格） | ✅ | ✅ | ✅（commonmark） | ✅ 已落地 | 无需做 |
| 内嵌 HTML block | ✅ | ✅ | ✅（commonmark 透传） | ✅ 透传 | 无需做（不做交互增强） |
| **highlight `==x==`** | ✅ | ✅ | ⚠️ 无官方 | ✅ 已落地（T-3.3.7 自研） | 无需做 |
| **underline `<u>x</u>`** | ✅ | ⚠️ HTML only | ⚠️ 无官方 | ✅ 已落地（T-3.3.7 自研） | 无需做 |
| **emoji `:smile:`** | ✅ | ✅（社区插件普及） | ⚠️ 无官方（社区 remark-emoji） | ❌ 未落地 | **P0 · Must** |
| **footnote `[^1]`** | ✅ | ✅ | ⚠️ 无官方 NodeView，但 gfm preset 已解析 mdast | ⚠️ 解析已通但无 UI | **P0 · Must** |
| **frontmatter (YAML)** | ✅ | ✅ | ⚠️ 无官方（需自研 + remark-frontmatter） | ⚠️ Round-trip 已保源码（wikilinkResolver 有 strip 逻辑）但编辑器视图未处理 | **P0 · Must** |
| **subscript `H~2~O`** | ✅ | ⚠️ 需插件（非默认） | ⚠️ 无官方 | ❌ 未落地 | **P1 · Should** |
| **superscript `x^2^`** | ✅ | ⚠️ 需插件（非默认） | ⚠️ 无官方 | ❌ 未落地 | **P1 · Should** |
| **definition list**（`term:def`） | ⚠️ 部分支持 | ⚠️ 需插件 | ⚠️ 无官方 | ❌ 未落地 | **P2 · Could** |
| abbr（`*[HTML]: …`） | ❌ | ❌ | ❌ | ❌ | **Won't now** |
| ins/del（`++ins++`/`--del--`） | ❌ | ❌ | ❌ | ❌ | **Won't now** |
| setext headings（`===`/`---`） | ⚠️ 解析但输出 ATX | ⚠️ 同 | ✅ 解析（commonmark） | ⚠️ 解析 OK · remark-stringify 强制输出 ATX | **P1 · Should**（Round-trip 保源码，不改写回策略） |
| code_block info meta（```lang meta```） | ✅ 透传 | ✅ 透传 | ⚠️ remark 会剥 meta 到 `node.meta` | ⚠️ Prism 只吃 lang，meta 丢失 | **P1 · Should**（保源码即可，UI 不消费） |

**结论汇总**：Must ×3（emoji / footnote / frontmatter）· Should ×4（sub / sup / setext 保真 / code meta 保真）· Could ×1（definition list）· Won't ×2（abbr / ins-del）。

---

## 3. 目标（Goals）

1. **G1 · 补齐 Typora+Obsidian 交集必备语法**：emoji · footnote · frontmatter 三项 P0 特性在 WYSIWYG 视图下可读、可编辑、可持久化。
2. **G2 · 补齐 Typora 独占易用语法**：subscript / superscript 在 inline 场景下有可用体验（P1）。
3. **G3 · Round-trip 零破坏**：本模块**任何新 schema / NodeView 都必须走 `roundtrip-tracker` 通道**；未编辑块 byte-for-byte 保源码。setext headings / code_block info meta 走**保源码回写**路径（不由编辑器主动改写为 ATX / 剥 meta）。
4. **G4 · 复用现有 pattern**：inline 装饰族（sub/sup）复用 highlight/underline 四件套；块级元数据（frontmatter）复用 math-view NodeView 编辑体验；footnote 引用/定义两态复用 wikilink hover-preview 交互原型。
5. **G5 · 好看放一放**：本模块只保证功能可用无 bug，视觉 CSS 与 Code-OSS 主题联动延后到 Phase 3 收尾统一处理，只做浅色/深色两档兜底样式。
6. **G6 · 中文交付**：所有命令 title、slash-menu label、错误提示、注释均中文（沿 Phase 3 policy）。

---

## 4. 非目标（Non-Goals）

- **NG1**：不做 abbr / ins / del（Typora 与 Obsidian 均不支持，无生态需求）。
- **NG2**：不做 emoji picker UI（P0 只做输入 `:smile:` → 渲染 🙂 + 反向序列化 emoji shortcode；GUI picker 延后）。
- **NG3**：不做 footnote 引用弹出编辑器（P0 只做锚点跳转 + hover preview；引用与定义均以源码呈现供编辑）。
- **NG4**：不做 frontmatter 键值型表单 UI（P0 只做块编辑器：进入编辑显示纯文本 YAML/TOML/JSON，Esc/Ctrl+Enter commit；结构化表单延后到 T-3.4.6 或独立任务）。
- **NG5**：不做 definition list（P2 · Could — 若 P0/P1 提前完成再挑上；默认排除）。
- **NG6**：不做 setext heading 主动改写为 ATX（保源码即可）；不做 code_block info meta 语义解析（仅保源码 byte-for-byte）。
- **NG7**：本模块**不引入**新的 Milkdown vendor 版本升级；仅新增 npm 包 `remark-emoji`、`node-emoji`（emoji）、`js-yaml`（frontmatter 校验）、`remark-frontmatter`（frontmatter mdast 通道），不动 `@milkdown/*` 版本。
- **NG8**：不做主题深度定制（跟随 Phase 3 policy）。

---

## 5. 用户故事

- **US-1 · 表达者（Emoji）**：作为写作者，我在段落里输入 `:smile:` 后按空格，应该看到 🙂；保存后 `.md` 里回写 `:smile:`（保源码语义）；重开文件不丢失。
- **US-2 · 学术写作者（Footnote）**：作为研究写作者，我在正文里写 `这是一段话[^1]`，在文末写 `[^1]: 引用来源`，应该看到正文里 `[^1]` 是可点击链接、悬停显示脚注内容、点击跳转到脚注定义；持久化到 `.md` 时格式不变。
- **US-3 · 元数据写作者（Frontmatter）**：作为博客/文档写作者，我在文件顶部有 YAML frontmatter（`---\ntitle: X\ndate: 2026-01-01\n---`），我打开 VSWord 应该看到 frontmatter 折叠为一行摘要（如"📄 title · date · tags"），点击展开为源码 textarea 编辑，Esc/Ctrl+Enter commit；不动 frontmatter 时 byte-for-byte 与原文件一致（含 YAML 引号、缩进、trailing newline）。
- **US-4 · 化学/数学写作者（Sub/Sup）**：作为理科写作者，我输入 `H~2~O` 看到 H₂O、输入 `x^2^` 看到 x²；持久化回 `.md` 保源码。
- **US-5 · Typora 迁移者（保真度洁癖）**：作为从 Typora 迁移的用户，我打开一份混合了 setext headings（`Title\n=====`）、code fences with meta（```` ```js {highlight-lines=[1,3]} ````）、`:smile:`、`[^1]`、frontmatter 的 markdown 文件，git diff 只体现"我实际改的正文那一处"，其它一切原样保源码。

---

## 6. 特性清单（含 MoSCoW / P0-P2 / 子任务归属）

| # | 特性 | MoSCoW | 优先级 | 归属子任务 |
|---|------|:------:|:------:|:----------:|
| F-01 | Emoji：`:name:` shortcode 输入 → 图形渲染（Unicode） | **Must** | P0 | T-3.5c.1 |
| F-02 | Emoji：inputRule `:name: `（触发字符：空格）转换为 emoji mark，`Esc` 撤销为 shortcode | **Must** | P0 | T-3.5c.1 |
| F-03 | Emoji：序列化回 `.md` 保持 `:name:` shortcode（**默认策略：保 shortcode，可配置改 unicode**，本 PRD 默认 shortcode） | **Must** | P0 | T-3.5c.1 |
| F-04 | Emoji：未识别 shortcode（如 `:notarealone:`）不 mark 化，保持文本原样 | **Must** | P0 | T-3.5c.1 |
| F-05 | Footnote：正文 `[^label]` 渲染为可点击上标链接 | **Must** | P0 | T-3.5c.2 |
| F-06 | Footnote：文末 `[^label]: text` 显示为定义列表区（页脚区，与 backlinks footer 共存不冲突） | **Must** | P0 | T-3.5c.2 |
| F-07 | Footnote：正文引用悬停显示定义预览（复用 wikilink-preview popover pattern） | **Should** | P0 | T-3.5c.2 |
| F-08 | Footnote：点击正文引用跳转到定义位置（滚动 + 短暂高亮） | **Must** | P0 | T-3.5c.2 |
| F-09 | Footnote：Round-trip 保源码（label 大小写、多行定义缩进、trailing whitespace 保留） | **Must** | P0 | T-3.5c.2 |
| F-10 | Frontmatter：识别文件顶部 YAML（`---\n...\n---`）为独立 NodeView | **Must** | P0 | T-3.5c.3 |
| F-11 | Frontmatter：默认渲染折叠摘要行（形如 "📄 title · N 个字段"），点击展开 textarea | **Must** | P0 | T-3.5c.3 |
| F-12 | Frontmatter：textarea 编辑 · Esc 取消 / Ctrl+Enter / 失焦 commit（复用 math-view 交互） | **Must** | P0 | T-3.5c.3 |
| F-13 | Frontmatter：YAML 语法错误 banner（`js-yaml` parse 失败时不阻塞编辑，红条提示第一行错误） | **Must** | P0 | T-3.5c.3 |
| F-14 | Frontmatter：Round-trip 保源码（引号 / 缩进 / 空行 / trailing `\n` byte-for-byte） | **Must** | P0 | T-3.5c.3 |
| F-15 | Frontmatter：TOML `+++...+++` 支持（Hugo 兼容） | **Should** | P1 | T-3.5c.3 |
| F-16 | Frontmatter：JSON `{...}` 支持（Zola / 某些 SSG 兼容） | **Could** | P2 | T-3.5c.3 |
| F-17 | Subscript：`~text~` inputRule + `$markSchema('subscript')` + toggle 命令 + `Ctrl+,` keymap | **Should** | P1 | T-3.5c.4 |
| F-18 | Superscript：`^text^` inputRule + `$markSchema('superscript')` + toggle 命令 + `Ctrl+.` keymap | **Should** | P1 | T-3.5c.4 |
| F-19 | Sub/Sup：与 highlight/underline 一致的 `$remark` 双向 handler，保源码 | **Should** | P1 | T-3.5c.4 |
| F-20 | Setext heading：解析进入编辑器后**不主动改写**为 ATX；未动块回写保源码 | **Should** | P1 | T-3.5c.5 |
| F-21 | code_block info meta：解析后 `node.meta` 存 attrs，序列化时把 meta 拼回 fence 头行 | **Should** | P1 | T-3.5c.5 |
| F-22 | 全体特性接入 `roundtrip-tracker.blockId`，`build-result.json` 新增 fixture 覆盖所有 P0/P1 特性 | **Must** | P0/P1 | T-3.5c.6 |
| F-23 | Definition list（`term\n:  def`）解析 + 只读渲染，不做编辑辅助 | **Could** | P2 | T-3.5c.6 |
| F-24 | slash-menu 增加 `/emoji` `/footnote` `/frontmatter` 快速插入入口（若 T-3.3.3 slash 已就位） | **Could** | P2 | T-3.5c.6 |

**Won't-now**（明确排除，写入本 PRD 备忘）：abbr（`*[XX]:`）· ins（`++x++`）· del（`--x--`）· emoji picker GUI · frontmatter 键值表单 UI · setext 主动改写策略。

---

## 7. 验收标准（Given / When / Then · ≥ 8 条）

**AC-1（Emoji · 输入触发）**：
- **Given** 编辑器打开一份 `.md` 文件，光标在段落末
- **When** 用户输入 `:smile:` 后按空格
- **Then** `:smile:` 转换为 🙂 图形显示 · 后续空格保留 · 光标停在空格之后

**AC-2（Emoji · 保源码序列化）**：
- **Given** 段落里显示 🙂（来源于 `:smile:` shortcode）
- **When** 用户不做任何修改直接保存
- **Then** `.md` 文件里 `:smile:` byte-for-byte 保源码 · `git diff` 无变化

**AC-3（Emoji · 未知 shortcode）**：
- **Given** 用户输入 `:notarealemoji:`
- **When** 按空格
- **Then** 文本原样保留 · 不进入 emoji mark · 不报错

**AC-4（Footnote · 引用与定义）**：
- **Given** md 内容包含 `正文 [^1] 内容\n\n[^1]: 定义文本`
- **When** 编辑器打开
- **Then** 正文里 `[^1]` 显示为可点击的上标数字/label · 文末定义显示在页脚区 · 悬停正文 `[^1]` 展示定义预览 · 点击跳转到定义位置

**AC-5（Footnote · Round-trip 保源码）**：
- **Given** md 内含 `[^my-label]: 多行定义\n    带缩进的第二行`
- **When** 用户只改正文其它段落的一个字符
- **Then** footnote 定义区 byte-for-byte 保源码 · label 大小写 / 缩进 / 换行保留

**AC-6（Frontmatter · 摘要与展开）**：
- **Given** md 顶部有 `---\ntitle: 测试\ndate: 2026-01-01\n---\n\n# 正文`
- **When** 编辑器打开
- **Then** 顶部显示折叠摘要行（含 title + 字段计数） · 点击摘要 · 摘要变 textarea 显示原始 YAML · Esc 恢复摘要

**AC-7（Frontmatter · 保源码）**：
- **Given** frontmatter 内含引号变体（`title: "Hello"` 与 `date: 2026-01-01`）与 trailing 空行
- **When** 用户不动 frontmatter，只改正文
- **Then** frontmatter 区 byte-for-byte 保源码 · 引号、缩进、空行、trailing `\n` 无变化

**AC-8（Frontmatter · YAML 错误不阻塞）**：
- **Given** frontmatter 中包含语法错误（如 `title: [未闭合`）
- **When** 用户展开 textarea
- **Then** textarea 下方显示红色 banner "YAML 解析错误：<msg> · 行 N" · 用户仍可继续编辑 · 修复后 banner 消失

**AC-9（Sub/Sup · P1）**：
- **Given** 光标在段落里
- **When** 用户输入 `H~2~O`（不含空格）
- **Then** `~2~` 转为 subscript mark 显示 H₂O · 保存后 `.md` 保 `H~2~O` 源码

**AC-10（Setext / code meta 保真 · P1）**：
- **Given** md 内含 `Title\n=====\n\n\`\`\`js {highlight=[1,3]}\ncode\n\`\`\``
- **When** 用户不动这两个块，只改其它段落
- **Then** setext heading 保源码（不被改写为 `# Title`） · code fence 头行的 ` {highlight=[1,3]}` meta byte-for-byte 保留

**AC-11（全模块 · Round-trip 契约不破）**：
- **Given** 模块 a 的 `build-result.json` Gate D 全绿基线
- **When** 引入本模块所有 P0+P1 特性 + 新增 fixture
- **Then** Gate D 保持全绿 · 未编辑块 byte-for-byte 命中率 100%

**AC-12（Mermaid · 无回归）**：
- **Given** 模块 b 22 类 mermaid fixture 全绿
- **When** 本模块合入后重跑
- **Then** 22 类全部保持渲染成功 · 无一 fallback

---

## 8. 技术约束

1. **不破 Round-trip 保真（模块 a 契约）**：所有新增 schema/NodeView 必须走 `roundtrip-tracker.template.js` + `blockIdAllocator.ts` 通道；未编辑块 byte-for-byte。
2. **不破 Mermaid（模块 b 契约）**：`code_block[lang=mermaid]` 路径不动，本模块新增的 code meta 保真（F-21）需白名单排除 `lang=mermaid`（mermaid 由模块 b NodeView 消费）。
3. **不引入 Milkdown 版本升级**：`@milkdown/*@7.21.2` 冻结；仅新增顶层 npm 包（`remark-emoji@^4`、`node-emoji@^2`、`remark-frontmatter@^5`、`js-yaml@^4`），进 `.tmp/milkdown-prod-builder/package.json`。
4. **复用现有 NodeView pattern**：
   - **Inline 装饰族**（sub/sup）复用 `highlight.template.js` 四件套（`$markSchema + $remark + $inputRule + $useKeymap`）
   - **块级元数据编辑**（frontmatter）复用 `math-view.template.js` 的"点击 → textarea + live preview + commit/cancel keymap"
   - **hover 预览 + 跳转**（footnote）复用 `wikilink-preview.mjs` + `wikilink.mjs` click handler
5. **CSP 兼容**：所有新增 webview 代码走 ESM bundle 路径（禁 `eval` / `new Function`）。
6. **Emoji 数据源**：`node-emoji` 库自带 shortcode 映射表；不接远端；bundle 增量控制在 +50 KB 内（本 PRD **默认，可推翻**）。
7. **Frontmatter 分隔符识别**：
   - YAML：文件首行 `---` + 结束 `---`
   - TOML（P1）：文件首行 `+++` + 结束 `+++`
   - JSON（P2）：文件首行 `{` + 平衡花括号
   - 均需**必须在文档最顶部**（前无非空白）才识别；否则退化为普通 thematic_break / paragraph。
8. **中文交付**：命令 title、slash-menu label、banner 错误消息、注释均中文（沿 Phase 3 policy）。
9. **好看放一放**：所有新 CSS 只做浅色/深色两档 CSS variable 兜底；视觉细调延后到 Phase 3 收尾统一处理。

---

## 9. 子任务拆分（T-3.5c.1 ~ T-3.5c.6）

| 子任务 | 标题 | 依赖 | 交付物 | 预估 iteration |
|--------|------|------|--------|----------------|
| **T-3.5c.1** | Emoji（shortcode → unicode，保源码） | 无 | `emoji.template.js`（$markSchema + $remark + $inputRule）· 新增 `remark-emoji` `node-emoji` · 6 类 fixture | 20-30 |
| **T-3.5c.2** | Footnote（引用 + 定义 + hover + 跳转） | wikilink-preview | `footnote.template.js`（引用 markType + 定义 NodeView） + hover popover 挂到 wikilink-preview 通用组件 · 4 类 fixture | 30-40 |
| **T-3.5c.3** | Frontmatter（YAML + 折叠摘要 + textarea 编辑 + Round-trip 保源码） | math-view · 模块 a | `frontmatter-view.template.js`（NodeView）· 新增 `remark-frontmatter` `js-yaml` · Round-trip tracker 通道 · 8 类 fixture（YAML + TOML + JSON + 空 + 错语法 + 引号变体 + 缩进 + trailing-newline） | 40-50 |
| **T-3.5c.4** | Sub / Sup（inline 装饰族，复用 highlight 模板） | 无 | `subscript.template.js` + `superscript.template.js`（各自四件套）· 4 类 fixture | 15-25 |
| **T-3.5c.5** | Round-trip 微调（setext 保真 + code fence info meta 保真） | 模块 a | 修改 `roundtrip-parser-hook.template.js` + 序列化钩子 · Gate D 新增 setext + meta fixture | 20-30 |
| **T-3.5c.6** | Gate G 收官（fixture 汇总 + CI + 补 slash-menu 入口 + definition list P2 兜底） | .1~.5 全绿 | `build-result.json` 新增 syntax-completion fixture 组 · CI Gate G · 可选 slash-menu 挂载 | 15-25 |

**建议执行顺序**：`.4（sub/sup 热身，最快出货）` → `.1（emoji）` → `.5（Round-trip 微调，先补底）` → `.2（footnote）` → `.3（frontmatter，最重）` → `.6（收官）`。
若用户偏好"先难后易"或"逐语法族"，见 §10 方向性问题。

---

## 10. 方向性问题（a/b/c，交给用户一次说完 5 题）

### Q1 · MoSCoW must 收哪些？（决策决定后续 iteration 分配）
- **a**：**只做 P0 三项**（emoji · footnote · frontmatter），P1 / P2 全部推后到"Phase 3 收尾统一"
- **b**：**P0 + P1 全做**（emoji · footnote · frontmatter · sub/sup · setext 保真 · code meta 保真），P2 兜底不做
- **c**：**P0 + P1 + P2 全做**（追加 definition list · slash-menu 入口），一次做透

### Q2 · Emoji 序列化默认策略？（影响 F-03 · Round-trip 语义）
- **a**：保 `:smile:` shortcode（**PRD 当前默认**，git 友好、Typora 一致）
- **b**：改写为 unicode 🙂（更"直观"，但破坏源码可读性）
- **c**：跟随用户输入原始形式（源码是 shortcode 就保 shortcode，源码是 unicode 就保 unicode）— 语义最保真但实现最复杂

### Q3 · Frontmatter 默认视图？（影响 F-11 · US-3 体验）
- **a**：**默认折叠为摘要行**，点击展开（**PRD 当前默认**，视觉干扰最小）
- **b**：默认展开为源码 textarea（Obsidian 风格，直接可编辑）
- **c**：默认渲染为只读键值预览卡片，点击进入编辑（Notion 风格，但实现最重）

### Q4 · Footnote 编辑体验？（影响 F-06 · 定义区呈现方式）
- **a**：**定义区显示在文末页脚**（PRD 当前默认，与 backlinks footer 并列或替换）
- **b**：定义区就地显示（在源码位置内联渲染，Typora 风格）
- **c**：定义区完全隐藏，只在悬停/点击时以 popover 展现（Notion 风格）

### Q5 · 分批交付节奏？（影响 §9 子任务 push 策略）
- **a**：**每子任务单独 commit + push**（PRD 当前默认，与模块 b .1~.5 一致 · 5-6 个 commit 分开）
- **b**：整个模块 c 一次性大 commit（一次评审）
- **c**：按语法族分批（emoji+sub/sup 一次 · frontmatter+footnote 一次 · Round-trip 微调+收官一次 · 3 个 commit）

---

## 11. 风险与假设

- **R1 · Milkdown remark ↔ mdast 双向 handler 复杂度**：emoji / frontmatter 的 stringify handler 需自研（Milkdown 官方未提供）；参考 `highlight.template.js` 已跑通的双向 handler 模板。
- **R2 · Round-trip fixture 组合爆炸**：frontmatter × 引号变体 × YAML/TOML/JSON × 空/错语法 = 至少 8 类 fixture，需在 T-3.5c.3 一次到位否则会漏 case。
- **R3 · GFM footnotes vs commonmark 冲突**：`@milkdown/preset-gfm` 已带 GFM footnotes 解析（mdast），但**无 NodeView** — VSWord 只需接 NodeView 层，无需重造 parser（假设，PRD 认定成立；若 T-3.5c.2 起步验证发现不成立需回来更新）。
- **R4 · bundle 体积**：`node-emoji` 完整表约 40 KB min+gzip，`js-yaml` 约 20 KB，`remark-frontmatter` <5 KB — 总增量控制在 +100 KB 以内（**默认，可推翻**）。
- **R5 · setext heading 保真策略与 remark-stringify 冲突**：`remark-stringify` 默认 `setext: false`（强制 ATX）；模块 a 的 Round-trip parser hook 已在处理"未动块保源码"，理论可覆盖 setext 场景，但需在 T-3.5c.5 补 fixture 验证；若失败，退回"块级 track + 未编辑块整块 substring 替换"策略。
- **A1**（假设）：Milkdown `@milkdown/preset-gfm@7.21.2` 已开启 GFM footnotes；如未开启需在 gfm 配置里显式打开（成本 <1 iteration）。
- **A2**（假设）：`remark-frontmatter@5` 与本项目 `unified@11 / remark-parse@11 / remark-stringify@11` 兼容（vendor 侧确认由 T-3.5c.3 起步时验证）。

---

## 12. 里程碑与预算

| 阶段 | 覆盖子任务 | Iteration 上限 | 交付判定 |
|------|-----------|:--------------:|----------|
| **c-阶段-A（热身）** | T-3.5c.4（sub/sup） | 25 | Gate G-A 绿 |
| **c-阶段-B（P0 核心）** | T-3.5c.1（emoji）+ T-3.5c.2（footnote）+ T-3.5c.3（frontmatter） | 120 | Gate G-B 绿 · 3 项 P0 特性 fixture 全绿 · Round-trip Gate D 保持全绿 |
| **c-阶段-C（保真+收官）** | T-3.5c.5（setext + meta 保真）+ T-3.5c.6（Gate G） | 55 | Gate G 全绿 · push origin/dev |

**总预算**：约 200 iteration（对比模块 b Mermaid 约 180 iteration，规模略大但有可复用 pattern，风险低）。

---

## 13. 附录 · 与 plan T-3.4 的关系

plan `003-master-development-plan.md` 中的 T-3.4 "自定义排版 + Typora 缺失语法"曾计划 6 个子项（3.4.1 mark 扩展 / 3.4.2 emoji / 3.4.3 footnote / 3.4.4 用户字体 / 3.4.5 Pretext / 3.4.6 frontmatter），但历史 commit `9f76d3e0` 只交付了 Outline 面板（实为 T-3.7c.2）。

本模块 c（T-3.5c）**覆盖并替换** plan T-3.4 中的：
- ✅ 3.4.1 mark 扩展中的 sub/sup（highlight/underline 已在 T-3.3.7 落地）→ T-3.5c.4
- ✅ 3.4.2 Emoji → T-3.5c.1
- ✅ 3.4.3 Footnote → T-3.5c.2
- ✅ 3.4.6 Frontmatter → T-3.5c.3

**不覆盖**（留给后续独立任务）：
- ⛔ 3.4.4 用户字体三元组 Settings — 属主题层，Phase 3 收尾统一
- ⛔ 3.4.5 Pretext 快速排版 — 独立能力，另立任务

plan 主表 T-号对账建议在 T-3.5c 全套 push 后统一补一次（类比 T-3.5b 收官后）。

---

**PRD 结束 · v1 · 2026-07-05 · 待用户 Q1~Q5 决策后进入实现阶段**
