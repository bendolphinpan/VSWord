# VSWord Phase 3 Block Editor MVP — 阶段验收检查清单

**验收范围**：从上次验收（Phase 2 Markdown Core 完成）到当前 Phase 3 Block Editor MVP 骨架搭建完成。

---

## 一、前期完成（已提交，Phase 2 收尾）

### 已在之前验收通过 ✓
- [x] `updateMarkdownFrontmatter` bug 修复：保留未更新的 known 字段（`created`, `cover` 等不丢失）
- [x] `parseMarkdownTagsInput` 功能实现：支持中英文逗号分隔、去空、去重
- [x] `VswordUpdateMarkdownMetadataAction` 命令：Quick Input 顺序编辑 title/status/tags，写入 frontmatter
- [x] Markdown 预览命令：复用 VS Code 上游 `markdown.showPreview` / `showPreviewToSide` / `reopenAsSource`
- [x] VSWord Home View 增加 Markdown 预览按钮入口
- [x] `markdown-frontmatter-roundtrip.mjs` 测试套件：37 项断言全部通过
- [x] 复杂 frontmatter 样例覆盖：known+unknown 字段、代码块内 `---`、图片、CJK

---

## 二、本次 Phase 3 Block Editor MVP — 需验收项

### 编译和构建检查 ✅ 已通过（当前代码）
- [ ] 拉取最新 `dev` 分支，运行 `npm run compile`，确认 0 errors
- [ ] 确认 BlockNote vendor 构建产物已存在：
  ```
  code-oss/src/vs/workbench/contrib/vsword/browser/blockeditor/vendor/
    ├── index.js (≈1.5MB)
    ├── index.css (≈26KB)
    └── *.woff / *.woff2 (Inter 字体，共 18 个文件)
  ```
- [ ] 确认构建脚本可重入：在 `D:\GIT\VSWord` 运行 `node code-oss/src/vs/workbench/contrib/vsword/browser/blockeditor/build-blockeditor.cjs`，构建成功退出码 0

### GUI 功能测试
1. 启动 VSWord，打开 VSWord Home 侧边栏
   - [ ] 在 "Quick Actions" 区域能看到 **"Open Block Editor"** 按钮
2. 点击 "Open Block Editor" 按钮
   - [ ] 弹出文件选择器，能选择 `.md` 文件
   - [ ] 选择后打开 Block Editor webview 面板
   - [ ] webview 加载完成，显示 BlockNote 编辑器界面
   - [ ] 原有 Markdown 内容正确转换为 blocks（段落、标题、列表等）
3. 编辑测试
   - [ ] 能用斜杠菜单 (/) 插入新块（heading、paragraph、list、code、quote 等）
   - [ ] 能用拖放调整块顺序
   - [ ] 中文 IME 输入正常（不丢字、不重复、光标位置正确）
   - [ ] 自动保存：编辑后等待 ≈1 秒，内容自动写回原文件
4. Markdown round-trip 验证
   - [ ] 打开一个简单的 Markdown 文件（例如 Phase 2 的 `test/fixtures/markdown/complex-frontmatter.md`）
   - [ ] 在 Block Editor 打开 → 做少量编辑 → 关闭 Block Editor 面板
   - [ ] 在源代码编辑器重新打开，确认修改已保存且格式正确
   - [ ] frontmatter 完整保留，正文内容正确

### 技术实现检查
- [ ] 消息协议完整：
  - webview → host: `{type: 'ready'}` / `{type: 'save', content: string}`
  - host → webview: `{type: 'init', content: string}`
- [ ] CSP 安全正确：`script-src ${cspSource}` 无 `unsafe-eval`，符合 VS Code webview 要求
- [ ] 字体正确加载：编辑器字体显示为 Inter（fallback 到系统字体也正常）
- [ ] 主题适配：编辑器背景色匹配 VS Code 当前主题（light/dark 自适应）

---

## 三、已知限制（MVP 阶段，后续迭代）
- [ ] 自定义块类型尚未实现（仅使用 BlockNote 默认块）
- [ ] 不支持嵌入 VSWord Canvas / Mindmap 块（后续将扩展）
- [ ] 仅支持当前打开文件编辑 block 模式，尚未实现 custom editor 注册（当前复用 webview panel）
- [ ] 无单元测试覆盖 block ↔ markdown 转换（后续可补充）

---

## 四、提交信息（待你验收通过后合并）
```
feat(vsword): Phase 3 Block Editor MVP skeleton

- Add blockeditor directory with:
  * blockEditorAction.ts: Open Block Editor command + message handling
  * blockEditorHtml.ts: CSP-safe HTML template with theme adaptation
  * build-blockeditor.cjs: standalone esbuild builder for BlockNote
- Vendor bundle: @blocknote/core + @blocknote/react + React 18 (1.5MB JS)
- Markdown ↔ blocks round-trip via BlockNote built-in markdownToBlocks / editor.blocksToMarkdownLossy
- Add "Open Block Editor" button to VSWord Home view
- Compiles cleanly: 0 errors
```

---

## 操作路径（供你参考）
```
cd D:\GIT\VSWord
git pull origin dev
cd code-oss
npm run compile
# 如果你需要重新构建 vendor (一般不需要，已构建好):
node src/vs/workbench/contrib/vsword/browser/blockeditor/build-blockeditor.cjs
# 然后启动 VSCode:
# yarn start
# 打开 VSWord Home → 点击 "Open Block Editor" → 选择一个 .md 文件测试
```
