# FR-01 — Notion 风格 Markdown 块编辑器

> **从属于**：`PRD-vsword-v1.md` §3.1 F-DOC-4
> **范围**：Notion 风格的块编辑模式。其他模式（源码 / 预览 / 阅读）见 PRD §3.1 F-DOC-3。
> **目标**：在 `.md` 文件之上提供 Notion 级编辑体验，但**不破坏 Markdown 数据无损**，**不实现联动 / 历史 / 协作**。
> **执行者**：fullstack-developer

---

## 1. 用户故事

- 作为写作者，我打开任意 `.md` 文件，可以切换到"块模式"，像 Notion 一样用 `/` 命令插入标题、列表、引用、代码、图片、表格等块，写完保存仍然是干净的 Markdown。
- 作为写作者，我在块模式中拖拽块改变顺序，外部用 VS Code / Obsidian / Typora 打开同一文件，结构是合理的 Markdown。
- 作为写作者，我在块模式中粘贴图片，图片会自动写入 `assets/<文件名>/` 并以相对路径插入。
- 作为写作者，我打开包含未知 Markdown 语法（如某个插件的 directive）的文件，块编辑器**保留**它原样，不丢字符。
- 作为写作者，我用中文输入法打字时不会因为输入"/"而误触 slash menu。

---

## 2. 功能清单（按 Notion 对齐 + 范围裁剪）

> 图例：✅ P0 必做｜🟡 P1 次轮｜⚪ P2 远期｜❌ 不做

### 2.1 基础块

| Notion 块 | VSWord 状态 | 对应 Markdown |
|---|:---:|---|
| Text / Paragraph | ✅ | 段落 |
| Heading 1/2/3 | ✅ | `#` / `##` / `###`（H4-6 同样支持但隐藏在二级菜单） |
| Bulleted list | ✅ | `-` |
| Numbered list | ✅ | `1.` |
| To-do（任务） | ✅ | `- [ ]` / `- [x]` |
| Toggle list（折叠） | ✅ | `<details><summary>` HTML（保留语义） |
| Quote | ✅ | `>` |
| Divider | ✅ | `---` |
| Callout | ✅ | GFM admonition（`> [!NOTE]`）或 `:::note` directive，二选一统一约定 |
| Code block（含语言） | ✅ | ` ```lang ` |
| Math（LaTeX 块） | ✅ | `$$ ... $$` |
| Inline math | ✅ | `$...$` |
| Image | ✅ | `![](...)` |
| Bookmark / Web link card | 🟡 | 渲染为 OG 卡片，但写回为普通 `[title](url)`；元数据缓存于 `.vsword/cache/` |
| Table | ✅ | GFM 表格 |
| Link to page | ✅ | `[text](./other.md)`，本地相对路径 |
| Mention（@user） | ❌ | 单用户，无意义 |
| Date mention | 🟡 | 写回为纯文本日期 `2026-06-18` |
| File attachment | ✅ | 拖入 / 粘贴文件，写入 `assets/`，正文用 `[name](path)` |
| Video / Audio embed | 🟡 | 用 HTML `<video>` / `<audio>` 保留 |
| Embed (iframe) | 🟡 | 用 `<iframe>` HTML 块保留 |
| Synced block | ❌ | PRD W-4 |
| Database (inline / full) | 🟡 (inline 单文件 table-as-database) | 仅作为单文件的表格扩展，不跨文件联动 |
| Database Linked View | ❌ | PRD W-5 |
| Comment / Discussion | ❌ | PRD W-3 |
| Page history | ❌ | PRD W-6，使用 Git |

### 2.2 内联（行内）样式

| Notion | 状态 | Markdown |
|---|:---:|---|
| Bold | ✅ | `**` |
| Italic | ✅ | `*` |
| Underline | 🟡 | `<u>` HTML（Markdown 无原生） |
| Strikethrough | ✅ | `~~` |
| Code | ✅ | `` ` `` |
| Link | ✅ | `[]()` |
| Color / Background | 🟡 | HTML `<span style>`；保守保留，不主推 |
| Equation inline | ✅ | `$...$` |
| Mention | ❌ | — |

### 2.3 编辑交互

| 交互 | 状态 | 备注 |
|---|:---:|---|
| `/` slash menu | ✅ | 中文 IME composition 期间禁触发 |
| Markdown 快捷输入（`# ` / `- ` / `> ` / ` ``` `） | ✅ | composition 期间禁触发 |
| 拖拽块改顺序 | ✅ | 块左侧 6 点把手 |
| 块右键菜单（复制 / 删除 / 转换类型 / 复制为 Markdown） | ✅ | |
| 多选块 | ✅ | Shift + click / 拖选 |
| 块缩进 / 反缩进（Tab / Shift+Tab） | ✅ | composition 期间禁触发 |
| 撤销 / 重做 | ✅ | 至少与 Monaco 等价深度 |
| 复制粘贴块（含跨文件） | ✅ | 序列化为 Markdown 写入剪贴板 |
| 全选 → 复制为纯 Markdown | ✅ | |
| 全选 → 复制为 HTML | 🟡 | |
| Block 链接锚点（块级 ID） | 🟡 | 用 `{#anchor-id}` 写入，非 Notion 私有锁 |
| Toggle 收起 / 展开持久化 | ✅ | 写入 `<details open>` 属性 |
| 多人光标 / Presence | ❌ | PRD W-1 |
| 评论 / 讨论 | ❌ | PRD W-3 |
| 页面历史时间线 | ❌ | PRD W-6（用 Git Timeline 视图） |

### 2.4 写回策略（核心质量门）

| 场景 | 行为 |
|---|---|
| 文件打开后未做任何修改即关闭 | **byte-for-byte 不变** |
| 仅修改某个 paragraph 的文字 | 仅该段落对应 Markdown 范围被重写，其他区域原样保留 |
| 包含未识别语法（自定义 directive、HTML、未知插件块） | 显示为 `raw` 块，可拖动顺序但禁止结构化编辑；写回时原文保留 |
| 表格被修改 | 整个表格区域重新序列化（表格难以做局部编辑），保留原列对齐风格（`| :--- |`）若可能 |
| 用户切换块类型（如 paragraph → heading） | 仅该块的 Markdown 范围被替换 |
| 解析失败（损坏的 frontmatter / 无效语法） | 弹出明确错误，禁止保存覆盖原文，提示切回源码模式手工修复 |
| 外部修改（用户在 VS Code 源码中改了同一文件） | 检测到 mtime / hash 变化，弹 reload / merge 提示，**绝不静默覆盖** |

---

## 3. 技术约束

| 项 | 约束 |
|---|---|
| UI 承载 | Custom Editor + Webview（隔离方案，便于上游同步） |
| 编辑器内核 | TipTap（基于 ProseMirror）首选；ProseMirror 备选；Lexical 不选（Markdown round-trip 弱） |
| Markdown 解析 | unified / remark / remark-gfm / remark-frontmatter（生态成熟） |
| Frontmatter | YAML，未知字段保留（详见 PRD F-DOC-2） |
| 图片粘贴 | 通过主进程 `VswordDocumentService.pasteAsset()` 写文件，webview 不直接写盘 |
| 文件写入 | 通过 `IFileService` / `ITextFileService`，**不允许** webview 直接 fs.write |
| 中文 IME | 必须有 composition guard，详见 §4.3 |
| 性能 | 5MB 以下 Markdown 60fps 编辑；5MB 以上提示切源码模式 |
| 许可证 | TipTap Pro 扩展不引入；只用 MIT/Apache 核心扩展 |
| Bundle | webview bundle 上限 3MB（gzip），超过需 lazy load |

---

## 4. 边界与陷阱

### 4.1 Markdown 方言选择

VSWord 默认遵循 **CommonMark + GFM**。其他方言：

| 方言 | 处理 |
|---|---|
| MDX / JSX | 不解析，作为 raw 块 |
| Pandoc 扩展（脚注、定义列表） | P1，先 raw 保留 |
| Obsidian `[[wikilink]]` | P1，识别后渲染为内部链接，写回保持原文 |
| `:::callout` directive | ✅ MVP 即支持（与 GFM admonition 二选一） |
| HTML 块 | ✅ 保留并尽量原样渲染（受 CSP 限制脚本不执行） |

### 4.2 Frontmatter 写回

- 用户在 frontmatter 属性面板修改字段时：保留原顺序，未修改字段不动。
- 用户字段含注释时：YAML parser 不支持注释 round-trip → 整个 frontmatter 区块以 raw 保留，禁止结构化修改（仅源码模式可改）。

### 4.3 中文 IME 必测矩阵

```text
if (event.isComposing || editorView.composing) {
  禁止触发: slash menu, markdown shortcut, block transform, indent, enter-as-newblock
}
```

测试输入法：微软拼音、搜狗拼音、QQ 拼音。
测试场景：
- 标题首行输入 "标题/" 不触发 slash menu
- 列表项中按 Enter 不在拼音半成品中切块
- 代码块中输入中文不触发自动闭合
- toggle 块标题中输入中文 → 折叠后展开仍正确

### 4.4 快捷键冲突

webview 拦截 vs 转发清单：

| 键 | webview 处理 | 转发到 workbench |
|---|---|---|
| `Ctrl+B/I/U` | ✅ 内联样式 | — |
| `Ctrl+K` | ✅ 插入链接 | — |
| `Ctrl+S` | — | ✅ 触发 `workbench.action.files.save` |
| `Ctrl+P` | — | ✅ 命令面板 |
| `Ctrl+Shift+P` | — | ✅ 命令面板 |
| `Ctrl+Z/Y` | ✅ 编辑器内 undo | — |
| `Tab` / `Shift+Tab` | ✅ 缩进，但 composition 期间不处理 | — |
| `Esc` | ✅ 关闭 slash menu / 退出多选 | — |
| `/` | ✅ slash menu，但 composition 期间不响应 | — |

---

## 5. 验收清单（fullstack-developer 自测必须全过）

### 5.1 数据无损（强阻塞）

- [ ] 准备 fixture 集（详见 `code-oss/src/vs/workbench/contrib/vsword/test/fixtures/markdown/`），含：
  - simple.md / frontmatter-with-comments.md / mixed-cjk-en.md / tables.md
  - html-block.md / unknown-directives.md / nested-lists.md / huge-1mb.md
- [ ] 每个 fixture 走 `打开 → 不改 → 保存` 流程，diff 必须为空（或仅白名单换行差异）
- [ ] 单块文字修改 → 仅对应 Markdown 范围被重写
- [ ] 未识别 directive 在文档中保持 raw 原样输出
- [ ] HTML 块原样保留
- [ ] 代码 fence 内容、语言 tag、缩进保留
- [ ] frontmatter 未知字段 / 注释保留（注释场景降级 raw）
- [ ] CJK 与 ASCII 混排不丢字符

### 5.2 编辑功能

- [ ] §2.1 中所有 ✅ 块类型可插入、修改类型、删除
- [ ] §2.2 中所有 ✅ 内联样式可应用 / 取消
- [ ] §2.3 中所有 ✅ 交互可正常触发
- [ ] 拖拽块改顺序，保存后 Markdown 顺序正确
- [ ] 多选块复制粘贴，结果是合法 Markdown
- [ ] Toggle 折叠状态写入 `<details open>` 属性，重新打开恢复

### 5.3 中文 IME（强阻塞）

- [ ] 微软拼音 / 搜狗拼音 / QQ 拼音 各跑一遍 §4.3 矩阵
- [ ] 至少录屏一段中文输入演示

### 5.4 性能

- [ ] 1MB Markdown 打开 < 1s
- [ ] 5MB Markdown 打开 < 5s 或弹出"建议源码模式"提示
- [ ] 编辑 60fps（无掉帧）

### 5.5 安全 / 集成

- [ ] webview CSP 阻止远程 script
- [ ] 所有文件写入走 ITextFileService（代码评审 grep `fs.write` 应只在主进程出现）
- [ ] 外部修改文件时不静默覆盖
- [ ] dirty / save / save as / revert / backup 全 OK
- [ ] VS Code 内置 Markdown 扩展的 preview 在另一个编辑器组中正常工作（与 VSWord 块编辑器并存）

---

## 6. 不做项再次确认

- ❌ Synced block / Backlink Database / Mention / Comment / Page history / Realtime Presence。
- ❌ Notion 私有 API / Notion 导入器（用户自行用现成工具）。
- ✅ 替代："页面历史"由 Code OSS 内置 Source Control（Git）+ Timeline 视图提供。
