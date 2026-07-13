# RD-5.2 · Pretext 版心/行宽预演（方案 C）

- **日期**：2026-07-13  
- **状态**：✅ 已实现（2026-07-13）  
- **承接**：`docs/spikes/rd-5.1-pretext.md` · `004` RD-5=A  
- **库**：`@chenglou/pretext@0.0.8`（lazy chunk，不进首屏 stub）

---

## 1. 产品选择

| 方案 | 结论 |
|------|------|
| A 分页高度 | 延后（用户感知弱） |
| **C 版心/行宽预演** | **本卡落地** |
| B 虚拟滚动 / D 阅读双引擎 | 不做 v1 |

**用户价值**：中文写作时一眼看到「当前版心大约每行多少字」，配合主题 `max-width` 与字体三元组（RD-7）。

---

## 2. 用户可见行为

1. Milkdown 工具栏右侧出现只读 chip：`约 N 字/行 · 版心 Wpx`  
2. 打开 `.md` 后 **lazy** 加载 Pretext，首屏不阻塞  
3. 主题切换 / 字体 Settings 变更后 **debounce 刷新**  
4. Settings：`vsword.markdown.lineMeasure`（boolean，默认 `true`）；关则隐藏 chip 且不加载库  

---

## 3. AC

| ID | Given / When / Then |
|----|---------------------|
| AC-1 | 默认 Settings 开 · 打开 `.md` · 1s 内 chip 出现且 N∈[8,120]、W>0 |
| AC-2 | 关 `lineMeasure` · chip 隐藏 · 网络/vendor 无 pretext 请求（已加载过的 session 可保留 chunk 缓存） |
| AC-3 | 改 `fontSize` 或主题 · N 或 W 变化（不必像素级） |
| AC-4 | vendor 构建：pretext 在独立 lazy chunk；主 stub 不静态 import |
| AC-5 | 纯函数单测：format label / 估算公式 |

---

## 4. 非目标

- 不替换 ProseMirror 排版  
- 不画分页线 / 不改导出  
- 不保证与浏览器 `offsetWidth` 像素一致（Pretext 独立度量）

---

## 5. 技术要点

- `prepare` + `measureNaturalWidth('中')` → `charsPerLine ≈ maxWidth / charW`  
- `setLocale('zh-CN')`  
- 版心宽：读 `--vsword-max-width` 或 `#milkdown-root .ProseMirror` clientWidth  
- 字体：`getComputedStyle(prose).font`  

---

## 6. Gate

- build-milkdown-editor 绿  
- `run-pretext-measure-test.mjs` 纯函数绿  
- 手测 AC-1～3（可选）  

**PRD End · RD-5.2**
