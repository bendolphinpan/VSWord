# RD-5.1 · Pretext 快速排版 Spike

- **日期**：2026-07-13  
- **状态**：Spike 结论草案（未接入产品）  
- **拍板**：RD-5=A 做 · 不阻塞 RD-2/RD-1-lite/RD-10  
- **库**：[`@chenglou/pretext@0.0.8`](https://www.npmjs.com/package/@chenglou/pretext) · MIT · ~纯 JS 文本度量/多行布局  

---

## 1. 库能做什么

| 能力 | 说明 |
|------|------|
| 多行文本度量 | 不依赖热路径 DOM reflow；Canvas 测量 + 缓存 |
| 换行 | 类 CSS `overflow-wrap` / `word-break`；**CJK / 韩文 / 无空格混排**有文档支持 |
| 富文本 demo | 官方 demo 含 marked 解析 + 行内 pill/code 流式布局、虚拟列表聊天 |
| 体积 | 作者宣称小体积、零依赖（以 npm 实装为准） |

**不是**：完整 Markdown 编辑器；不替代 Milkdown/ProseMirror。

---

## 2. 与 VSWord 的结合点（候选）

| 方案 | 接入点 | 价值 | 风险 |
|------|--------|------|------|
| **A. 只读预览/分页高度** | 导出预览、打印分页、大纲高度估算 | 少改编辑内核 | 用户感知弱 |
| **B. 虚拟滚动辅助** | 超长文档行高缓存（配合 RD-1） | 大文档滚动 | 与 PM 视口耦合重 |
| **C. 写作「版心/行宽」预演** | 设置里「每行字数 / 版心宽度」即时预览条 | 中文写作差异化 | 需 UI |
| **D. 阅读模式排版引擎** | reading 下用 Pretext 画只读层 | 强差异化 | 双渲染、选区/复制难 |

**Spike 推荐首落点**：**C（轻）或 A（更轻）**；**不做 D 作为 v1**（双引擎成本过高）。

---

## 3. CSP / Bundle 约束（VSWord webview）

Milkdown webview CSP（现行）：

- `script-src`：仅 webview 源（无 `unsafe-eval` 业务依赖）  
- `style-src`：允许 `unsafe-inline`  
- 无随意 CDN  

| 检查项 | 结论 |
|--------|------|
| `eval` / `new Function` | 接入前对 package 做静态扫（同 milkdown vendor build） |
| Canvas | 浏览器 webview 可用；**不**在 Node 主进程热路径强依赖 |
| 打包 | 进 `milkdownEditor/vendor` **独立 chunk** 或按需 `import()`（对齐 RD-8 lazy） |
| 体量预算 | 首屏 gzip 增量目标 **&lt; 20KB**；超则仅 lazy |

---

## 4. CJK 验收（手测 / 自动化草案）

1. 纯中文长段：标点挤压、行尾不出现孤立标点（与浏览器对比）  
2. 中英混排：`VSWord` / 数字 / 全角半角  
3. emoji + 中文  
4. 与当前 Milkdown `overflow-wrap: anywhere` 结果差异记录（不要求像素一致）

自动化：jsdom **不足以**完整替代 Canvas 字体；以 **webview 手测矩阵** 为主，单元测只锁 API 形状。

---

## 5. 不做（本 spike）

- 替换 ProseMirror 排版  
- 为 Pretext 重做整页 WYSIWYG  
- 阻塞 RD-10 Portable（用户已要求 Portable 放 UI 之后）

---

## 6. 下一步（RD-5.2）

1. 产品 PRD：选定 A 或 C 的用户可见入口与 AC  
2. 在 milkdown webview 内 **lazy** 挂一个 hidden measure 用 canvas + 最小 demo 面板  
3. 若 bundle/CSP 不过 → 改 B 砍 scope 或换库  

**Go/No-Go 门槛**：CJK 混排手测可接受 + vendor 扫无 eval + 增量 gzip 预算。

---

## 7. 修订

| 日期 | 说明 |
|------|------|
| 2026-07-13 | 首建：库选型、结合点、CSP/CJK、推荐首落点 C/A |

**Spike End · RD-5.1**
