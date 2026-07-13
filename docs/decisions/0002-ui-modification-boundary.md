# Decision 0002: Code-OSS UI 改造边界（L0–L3）

- **日期**：2026-07-13  
- **状态**：Approved（用户确认「展示写进去」）  
- **范围**：VSWord 在 Code OSS 1.124.2 上的壳层 / 写作表面 / 扩展契约  
- **关联**：`000-vsword-master-plan.md` · `003-master-development-plan.md` · `004-remediation-and-debt-plan.md` · Figma [VSWord](https://www.figma.com/design/6YryVesDzsyNOuYtojsehd/VSWord?node-id=0-1)

---

## 1. 结论（一句话）

**允许**把 VSWord 改到接近 Figma「写作软件」观感（L0–L2），**必须**保住 Extension Host / 扩展 API / 编辑器·侧栏·面板契约；**禁止**以 UI 为名走 L3（换壳导致插件市场实质不可用）。

验收口令：

> **壳层允许 L2，扩展契约不可破。**

---

## 2. 产品铁律

| 必须保住 | 默认可藏 / 降权 | 默认去掉 |
|----------|-----------------|----------|
| Extension Host、Commands、Keybindings、Settings、Themes、Webviews、Custom Editors、FileService、Search、Workspace storage、VSIX | Debug、Terminal、SCM 抢镜、程序员向欢迎页 | 默认 Copilot 入口 / 推荐 |

原则：**最小侵入**——优先 `product.json` / 默认配置 / 主题 / `contrib/vsword`；不为观感拆 Extension Host。

---

## 3. 改造深度四档

### L0 · 配置与品牌（风险最低 · 随时可做）

- `product.json`：名称、图标、数据目录、Open VSX  
- 默认布局：`writer-mode` 隐藏 Debug/Terminal 等  
- 颜色 / 字体 / 图标主题（含 Typora `.css` 兼容）  
- 欢迎页、菜单与命令的中文用户可见串  

| 成本 | 上游合并 | 扩展 |
|------|----------|------|
| 低 | 几乎无痛 | 完全安全 |

### L1 · VSWord 自有表面（主力区 · 推荐主战场）

路径：`src/vs/workbench/contrib/vsword/**` + Milkdown / Canvas / Mindmap webview。

| 可大幅改 | 说明 |
|----------|------|
| Milkdown 编辑器内 UI | 工具栏、模式、表格 chrome、找替、主题——产品全权 |
| Canvas / Mindmap 整页 | 自研 webview |
| Writer Home、字数、导出入口 | contrib 内 |
| 侧栏 VSWord View、状态栏项 | Contribution 注册 |

| 成本 | 上游合并 | 扩展 |
|------|----------|------|
| 中 | 改动集中，好跟 | 安全 |

**Figma 主编辑区、写作工具条、文档内 chrome → 默认落 L1。**

### L2 · Workbench 壳重排 / 换皮（允许 · 正式 UI 阶段 · 控制 diff）

对应 Figma：`main interface` 的 left side、Title Bar、全局 Toolbar、侧栏按钮与分栏比例等。

| 做法 | 允许度 |
|------|--------|
| 默认布局配置 + 颜色 token 贴近稿面 | ✅ 优先 |
| contrib / CSS 变量 / **有限** patch 调整 titlebar、sidebar 视觉 | ✅ |
| 小范围改 workbench 布局（parts 顺序、默认可见性、标题栏） | ⚠️ 清单制 + 壳层手测 |
| 整文件重写 `layoutService` / 换掉 parts 模型 | ❌ 不建议 |

**L2 准入判据**（全部为是才可合入）：

1. 扩展的 Sidebar View / Panel / Editor / Webview 仍按 VS Code 契约工作  
2. Command Palette、Settings、快捷键绑定不失效  
3. VSIX / Open VSX 安装与激活路径可用  
4. 改动可列表化（文件清单），上游 sync 时可独立解决冲突  

| 成本 | 上游合并 | 扩展 |
|------|----------|------|
| 高 | 每次 sync 要专人合壳层 | 多数 OK，易踩边 |

### L3 · 换掉 Code 壳 / 自研外壳（默认禁止）

不要 workbench、只留 Electron + 自绘 UI，或命令面板/扩展安装不再兼容。

| 后果 |
|------|
| 「保留插件市场」实质破产或极难维持 |
| 与 `1.124.2` 基线分叉不可控 |
| 与 Phase 0–5 既有投资冲突 |

**除非**产品定义明确改为「不要扩展生态」——当前 **不允许**。

---

## 4. Figma 元素 → 档位映射（初版）

文件：`6YryVesDzsyNOuYtojsehd` · 页 Page 1 · 主帧 `main interface`（`31:87`）。

| 稿面元素 | 建议档位 | 说明 |
|----------|----------|------|
| 主编辑区内容（MD 排版、文档内工具条） | **L1** | Milkdown 全权 |
| 左侧文件/写作导航 | **L1～L2** | 尽量自定义 View；整栏换肤进 L2 |
| 顶栏 / 窗口控件 / 全局 Toolbar | **L2** | 壳层；独立 UI 阶段拆任务 |
| 彻底非 VS Code 信息架构 | **L3 风险** | 需单独立项评估扩展兼容 |

定稿后对指定 Frame 再跑 `get_design_context` 细化，本表只钉边界。

---

## 5. 与阶段策略的关系

```text
功能债 / 发布门槛（RD-1/2/10…）  →  L0 + L1 微调；壳层只修「挡功能」的
UI 定稿后的「布局阶段」          →  正式开 L2（对照 Figma main interface）
永远默认不做                     →  L3
```

- AGENTS「视觉延后」= **现在不当场抠颜色**，不是「永远不能改 workbench」。  
- Phase 3 功能债与 **RD-10 Portable** 不阻塞；L2 不抢 RD-1/2 发布硬门槛。  

---

## 6. Agent / 开发执行规则

1. 新 UI 任务必须在卡面或 PR 描述标明 **L0 / L1 / L2**（禁止标 L3 除非用户书面改产品定义）。  
2. L2 变更：单独 commit 前缀建议 `feat(workbench-shell):` 或 `style(workbench-shell):`，文件清单进 PR/commit body。  
3. L1 优先落在 `contrib/vsword`；能用配置/主题解决的 **不要** 碰 core layout。  
4. 评审红线：任何破坏 Extension Host 启动、扩展激活、Webview CSP 基线的改动 → 打回。  
5. 上游升级时：先合 L0/L1，再合 L2 壳层 patch。  

---

## 7. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-13 | 首建：用户确认 L0–L3 边界写入；Figma 链接入库 |

**Decision End · 0002**
