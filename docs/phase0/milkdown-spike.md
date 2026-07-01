# Milkdown Spike（T-3.1）

日期：2026-07-01  
Workspace：`D:\GIT\VSWord`  
Source：`D:\GIT\VSWord\code-oss`  
Spike 源码：`D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\browser\spikes\milkdown`  
临时 builder：`D:\GIT\VSWord\.tmp\milkdown-spike-builder`

## Verdict: VALIDATED / PARTIAL

Milkdown 7.21.2 的**最小包组合**可作为 VSWord Phase 3 WYSIWYG Markdown 编辑器的生产候选：

- ✅ 可打成 VS Code webview 可用的 ESM bundle。
- ✅ bundle 静态扫描无 `eval(` / `new Function(`。
- ✅ CommonMark + GFM 可解析并序列化包含中文、粗体、行内代码、表格的 Markdown。
- ✅ 许可证快照以 MIT/BSD/BlueOak 等宽松许可证为主，未发现 GPL/LGPL/MPL copyleft 主风险。
- ⚠️ Node/jsdom verifier 需要浏览器全局 polyfill；这是验证环境问题，非 webview 生产风险。
- ⚠️ 尚未做真实 Chromium webview IME 人工输入验证；T-3.2 前必须在 VSWord webview 中专项验证中文输入法 composition。

## 采用包组合

**采用：最小组合**

```text
@milkdown/core@7.21.2
@milkdown/preset-commonmark@7.21.2
@milkdown/preset-gfm@7.21.2
@milkdown/plugin-history@7.21.2
@milkdown/plugin-listener@7.21.2
@milkdown/transformer@7.21.2
@milkdown/prose@7.21.2
```

**明确不采用：`@milkdown/kit`**

原因：`@milkdown/kit` 会拉入 `@milkdown/components` / Vue 依赖链，并在当前 npm registry 下触发：

```text
No matching version found for @babel/parser@^7.29.7
```

这不是 Milkdown core 能力问题，而是大包依赖链 + registry 版本解析风险。VSWord 后续生产实现应继续使用最小组合，避免把 Vue components/UI layer 引进 webview。

## 构建与验证

执行命令：

```bash
cd D:/GIT/VSWord/code-oss
node --check src/vs/workbench/contrib/vsword/browser/spikes/milkdown/build-milkdown-spike.cjs
node src/vs/workbench/contrib/vsword/browser/spikes/milkdown/build-milkdown-spike.cjs
```

生成：

```text
src/vs/workbench/contrib/vsword/browser/spikes/milkdown/vendor/index.js
src/vs/workbench/contrib/vsword/browser/spikes/milkdown/vendor/index.js.LEGAL.txt
src/vs/workbench/contrib/vsword/browser/spikes/milkdown/vendor/spike-result.json
src/vs/workbench/contrib/vsword/browser/spikes/milkdown/vendor/THIRD_PARTY_LICENSES.md
```

`vendor/index.js` 和 `spike-result.json` 被 `.gitignore` 忽略；repo 中保留构建脚本、vendor `.gitignore` 和许可快照。

## Bundle 结果

来自 `vendor/spike-result.json`：

```json
{
  "milkdownVersion": "7.21.2",
  "webviewBundleBytes": 451510,
  "webviewBundleGzipBytes": 137986,
  "cspNotes": {
    "format": "esm",
    "minified": true,
    "dynamicEvalScan": {
      "evalToken": false,
      "newFunctionToken": false
    }
  }
}
```

结论：体积可接受，适合作为 Phase 3 MVP 的初始 bundle。生产接入时再按功能拆分/延迟加载评估。

## Markdown round-trip 结果

输入样本：

```markdown
# 标题 Title

你好，**Milkdown**。

- 第一项
- second `code`

| 列 A | 列 B |
| --- | --- |
| 甲 | 乙 |
```

验证结果：

```json
{
  "ok": true,
  "failed": [],
  "sourceBytes": 117,
  "outputBytes": 122
}
```

输出被 remark/Milkdown 规范化：

```markdown
# 标题 Title

你好，**Milkdown**。

* 第一项

* second `code`

| 列 A | 列 B |
| --- | --- |
| 甲   | 乙   |
```

说明：

- 语义保真：标题、中文、粗体、行内代码、GFM 表格均保留。
- 字节级不保真：列表 marker 从 `-` 变为 `*`，表格列宽被对齐，多了空行。
- 这符合计划中的两阶段策略：T-3.2/T-3.3 先做 Typora 级体验；T-3.8 再做 source-mapping / 未修改区域保真层。

## CSP / webview 风险

静态扫描：

- `eval(`：false
- `new Function(`：false
- 输出格式：ESM
- script 注入策略：后续生产接入必须用 VS Code webview nonce + 外部 script URI，禁止 inline script。

## CJK / IME 风险

本 spike 验证了中文 Markdown 解析与序列化，但**没有完成真实 IME composition 输入验证**。原因：当前 T-3.1 仍是隔离构建和 Node/jsdom round-trip 验证，未注册实际 VS Code webview editor。

T-3.2 进入生产接入时必须补以下人工/自动验收：

1. Windows 中文微软拼音：连续输入中文段落，不丢字、不重复、不跳光标。
2. 在标题、列表、表格单元格、行内代码邻近位置输入中文。
3. composition 未结束时不触发保存/serialize 覆盖。
4. undo/redo 不破坏中文输入。
5. 外部文件修改提示不在 composition 中打断编辑。

## 过程中发现的问题与处理

| 问题 | 结论 | 处理 |
|---|---|---|
| `@milkdown/kit` 安装失败：`@babel/parser@^7.29.7` 不存在 | 大包依赖链/registry 风险 | 避免 `@milkdown/kit`，采用最小包组合 |
| verifier 打包 jsdom 后找不到 `browser/default-stylesheet.css` | jsdom 内部 `require.resolve()` 不适合被 esbuild 打进单文件 | webview bundle 继续打包；Node verifier 直接从临时 builder 运行 |
| Node 24 `navigator` 只读 | jsdom polyfill 问题 | 用 `Object.defineProperty` 注入 globals |
| Milkdown timer 依赖 `addEventListener`/`dispatchEvent` | 浏览器环境天然存在，Node verifier 需要补 | 绑定 jsdom window 的事件 API 与 `Event` 构造器 |

## Recommendation for T-3.2

进入 WYSIWYG MVP 时建议：

1. 继续使用最小 Milkdown 包组合，不使用 `@milkdown/kit`。
2. 保持 `.md` 文件类型关联路径：`IEditorResolverService.registerEditor('*.md', { priority: builtin })`。
3. webview bundle 用外部 script + nonce，CSP 禁止 `unsafe-inline` / `unsafe-eval`。
4. 保存策略使用 `listenerCtx.markdownUpdated` 标记 dirty，但不要在 composition 中立即 persist。
5. 第一版接受 remark 规范化；不要在 T-3.2 里追求 byte-for-byte 保真，保真层留到 T-3.8。
6. T-3.2 完成后，必须启动 VSWord 并人工验收中文 IME。
