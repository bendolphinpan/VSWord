# FR-02 — 思维导图（.mm 读写 + XMind 风格交互）

> **从属于**：`PRD-vsword-v1.md` §3.1 F-MM-1/2/3
> **目标**：以 FreeMind `.mm` (XML) 为权威格式实现读写无损；交互与视觉对齐 XMind 主流功能。
> **执行者**：fullstack-developer

---

## 1. 用户故事

- 作为写作者，我打开 `.mm` 文件，能看到 XMind 风格的思维导图（含分支、图标、颜色、关系线），能编辑节点文字、增删节点、拖动重排，保存后 FreeMind / XMind / Freeplane 等工具仍能正确打开。
- 作为写作者，我能切换布局：思维导图（左右展开）、组织结构图（自上而下）、树形（横向）、鱼骨图、时间轴、逻辑图。
- 作为写作者，我能把 Markdown 大纲一键导入为思维导图，反向导出 Markdown 也能保留主结构。
- 作为写作者，我导入了别人的 `.mm`（含我不认识的 XML 属性 / 富文本），编辑保存后这些"未知信息"必须不丢失。

---

## 2. 功能清单（XMind 对齐 + 范围裁剪）

> 图例：✅ P0｜🟡 P1｜⚪ P2｜❌ 不做

### 2.1 文件格式

| 格式 | 状态 | 备注 |
|---|:---:|---|
| `.mm`（FreeMind XML） | ✅ | 权威读写格式 |
| `.mm`（Freeplane 扩展） | ✅ | 兼容打开，未知扩展 preserve |
| `.xmind`（XMind ZIP） | ⚪ P2 | 仅 P2 阶段做导入 / 导出 |
| `.mmap`（MindManager） | ❌ | 不做 |
| `.opml` | 🟡 P1 | 大纲互转 |
| Markdown 大纲 | ✅ | 互转，标记有损 |

### 2.2 节点能力

| 能力 | 状态 | 备注 |
|---|:---:|---|
| 节点文本（单行 / 多行） | ✅ | |
| 富文本节点（粗斜体 / 颜色 / 字号） | ✅ MVP 只读保留, 编辑 🟡 P1 | FreeMind `<richcontent>` |
| 节点备注（note） | ✅ | `<richcontent TYPE="NOTE">` |
| 节点超链接（link） | ✅ | `LINK` 属性 |
| 节点图标 | ✅ | FreeMind 内置图标集 + XMind 图标集映射 |
| 节点颜色 / 背景色 | ✅ | `COLOR` / `BACKGROUND_COLOR` |
| 节点形状（圆角 / 矩形 / 椭圆） | 🟡 | XMind 风格 shape |
| 节点折叠 | ✅ | `FOLDED="true"` |
| 节点排序（左右 / 上下） | ✅ | `POSITION="left/right"` |
| 关系线（free relationship） | ✅ | FreeMind `<arrowlink>` |
| 概要（summary，弧形括号） | 🟡 | XMind 特性，FreeMind 用扩展属性记录 |
| 标注（callout，气泡注释） | 🟡 | XMind 特性 |
| 边界（boundary，分组虚线框） | 🟡 | XMind 特性 |
| 任务标签（优先级 / 进度） | 🟡 | 用 FreeMind icon 模拟 |
| 浮动主题 | 🟡 | 多根节点 |
| 附件 / 图片 | ✅ | `<hook NAME="ExternalObject">` |
| 公式（LaTeX） | 🟡 | richcontent 内嵌 |

### 2.3 布局

| 布局 | 状态 | 算法 |
|---|:---:|---|
| 思维导图（左右展开） | ✅ | 默认 |
| 树形（横向自左向右） | ✅ | Reingold-Tilford |
| 组织结构图（自上而下） | ✅ | 层级布局 |
| 逻辑图（自左向右） | ✅ | 层级布局 |
| 鱼骨图 | 🟡 | 主轴 + 斜分支 |
| 时间轴 | 🟡 | 水平 / 垂直时间轴 |
| 矩阵 | ⚪ | XMind 矩阵视图，远期 |
| 树表 | ⚪ | XMind 风格 |

布局信息存储：
- 若 `.mm` 原文件无明确布局字段，默认"思维导图"。
- 用户切换布局 → 写入 `.vsword/metadata/mindmap/<file-hash>.json`，**不污染 `.mm` 源文件**。
- 节点位置不写入 `.mm`（FreeMind 不持久化坐标），全部由布局算法运行时计算。

### 2.4 交互

| 交互 | 状态 |
|---|:---:|
| 双击 / Enter 编辑节点文本 | ✅ |
| Tab 增加子节点 | ✅ |
| Enter 增加同级节点 | ✅ |
| Delete 删除节点（含子树） | ✅ |
| 拖拽节点改父 / 排序 | ✅ |
| 复制 / 剪切 / 粘贴节点（含子树） | ✅ |
| 撤销 / 重做 | ✅ |
| 缩放 / 平移画布 | ✅ |
| 折叠 / 展开（Space / 单击 ±） | ✅ |
| 搜索节点 | ✅ |
| 节点风格面板（颜色 / 图标 / 字体） | ✅ |
| 关系线绘制（拖拽出箭头） | ✅ |
| 多选节点 | ✅ |
| 主题模板（XMind 风格皮肤） | 🟡 |
| 演示模式（Brainstorm / Pitch） | ❌ | 不做 |
| 实时协作 | ❌ | PRD W-1 |

### 2.5 互转

| 互转 | 状态 | 备注 |
|---|:---:|---|
| Markdown 大纲 → `.mm` | ✅ | H1=root, H2-H6=层级，列表→子节点 |
| `.mm` → Markdown 大纲 | ✅ | 提示有损：图标 / 颜色 / 关系线丢失 |
| `.mm` → OPML | 🟡 | |
| OPML → `.mm` | 🟡 | |
| `.mm` → PNG / SVG 导出 | 🟡 | |
| `.mm` → PDF | ⚪ | |

---

## 3. 数据无损规则（强阻塞）

### 3.1 必须保留

- 所有未识别的 XML 属性（如 `CREATED` / `MODIFIED` / `HGAP` / `VGAP` / 工具私有属性）
- 所有未识别的子节点（如 `<font>` / `<hook>` / `<cloud>` / `<arrowlink>` / `<richcontent>`）
- 子节点顺序（尤其 richcontent / icon / node 的相对顺序）
- 注释、CDATA、processing instruction
- XML 声明 `<?xml ... ?>` 与 doctype

### 3.2 写回规则

| 操作 | 写回行为 |
|---|---|
| 仅修改节点文本 | 仅更新对应 node 的 `TEXT` 或 `<richcontent>` 文本块；其他属性原样 |
| 切换图标 | 仅增删 `<icon>` 子节点，保留其他子节点顺序 |
| 改颜色 | 更新 `COLOR` / `BACKGROUND_COLOR` 属性 |
| 折叠 | 更新 `FOLDED` 属性 |
| 增节点 | 生成最小 FreeMind 兼容 XML 子树，附 `ID`、`TEXT`、`POSITION`（仅一级节点） |
| 删节点 | 删除完整 XML 子树 |
| 切换布局 | **不写 `.mm`**，写 `.vsword/metadata/mindmap/<hash>.json` |
| 关系线 | 写入对应 source 节点的 `<arrowlink DESTINATION="..."/>` |

### 3.3 Preservation 模型

```ts
interface VswordMindmapNode {
  id: string;
  text: string;
  children: VswordMindmapNode[];
  // VSWord 已识别字段
  side?: 'left' | 'right';
  folded?: boolean;
  link?: string;
  icons?: string[];
  note?: string;
  color?: string;
  backgroundColor?: string;
  // 保留未识别内容
  raw: {
    tagName: string;            // 通常是 "node"
    attributes: Record<string, string>;       // 完整原属性
    unknownAttributes: Record<string, string>; // 减去已识别属性
    unknownChildren: unknown[]; // 未识别 XML 子节点（保结构）
    originalChildOrder: Array<                 // 原始子节点顺序快照
      | { kind: 'node'; id: string }
      | { kind: 'unknown'; index: number }
    >;
  };
}
```

序列化时：按 `originalChildOrder` 依次输出，已识别 child 用最新数据，未识别 child 原样回填。

---

## 4. 技术约束

| 项 | 约束 |
|---|---|
| UI 承载 | Custom Editor + Webview |
| XML parser/writer | `fast-xml-parser` 或同类（先做 spike，验证属性顺序、注释、CDATA 是否可保留） |
| 渲染 | SVG（更适合放大缩小、节点 / 关系线、可访问性）。Canvas 2D 备选（性能更高但选择 / 文本编辑成本高） |
| 布局算法 | `d3-hierarchy` + 自实现 Reingold-Tilford 微调；鱼骨 / 时间轴自实现 |
| 文件写入 | 走 `ITextFileService`，webview 不直接写盘 |
| 性能 | 1000 节点流畅（60fps 拖拽）；10000 节点必须可打开（不要求流畅，但不卡死） |
| 中文 | 节点文本输入支持 IME，composition 期间不响应快捷键 |
| 许可证 | 渲染库 / 解析库 必须 MIT / Apache / BSD |

---

## 5. 边界与陷阱

### 5.1 XMind vs FreeMind 字段差异

XMind `.xmind`（ZIP+JSON）和 FreeMind `.mm`（XML）数据模型差异显著。VSWord 选择 `.mm` 为权威，意味着 XMind 私有的：

- 概要（summary）、边界（boundary）、标注（callout）、矩阵 → 用 FreeMind `<hook>` / 自定义属性记录，标记 `vsword:type` 命名空间，**不污染 FreeMind 兼容性**。
- 主题样式（XMind 主题模板）→ 存 `.vsword/metadata/mindmap/<hash>.json`，不写 `.mm`。

### 5.2 富文本 round-trip

- MVP：`<richcontent>` 节点**只读保留**。用户在 VSWord 块编辑器编辑节点时，VSWord 弹提示"此节点含富文本，将转为纯文本，是否继续？"，用户确认后才覆盖。
- P1：富文本可视化编辑（HTML 子集）。

### 5.3 Markdown 大纲互转

```text
Markdown:
  # 书名
  ## 第一章
  - 场景 A
  - 场景 B
  ## 第二章

→ Mindmap:
  书名
   ├─ 第一章
   │   ├─ 场景 A
   │   └─ 场景 B
   └─ 第二章
```

转换是**结构转换**，不保留：图标、颜色、关系线、布局、富文本格式。导入 / 导出时必须弹明确提示。

### 5.4 大文件性能

- > 1MB `.mm` 不强制全量渲染所有节点；折叠状态下隐藏节点不进 SVG 树。
- > 10000 节点时禁用动画、降级为静态布局。

---

## 6. 验收清单（fullstack-developer 自测必须全过）

### 6.1 数据无损（强阻塞 — Gate F）

- [ ] 准备 fixture 集 `code-oss/src/vs/workbench/contrib/vsword/test/fixtures/mindmap/`：
  - freemind-basic.mm / freemind-icons.mm / richcontent.mm
  - unknown-attrs.mm / unknown-children.mm / large-1k-nodes.mm
  - xmind-exported.mm（XMind 导出的 `.mm`，用于交叉兼容）
- [ ] 每个 fixture 走 `打开 → 不改 → 保存`，未识别属性 / 子节点 / 顺序全保留
- [ ] 修改单节点文本 → 仅该 `<node TEXT="">` 被改，其他原样
- [ ] 切换布局 → `.mm` 文件不变，`.vsword/metadata/mindmap/` 有变更
- [ ] 用 FreeMind / Freeplane 打开 VSWord 保存的 `.mm` 必须无报错
- [ ] 用 XMind 导入 VSWord 保存的 `.mm`（XMind 支持 .mm 导入）必须可解析

### 6.2 编辑功能

- [ ] §2.2 中所有 ✅ 节点能力可正常使用
- [ ] §2.3 中所有 ✅ 布局可切换且渲染正常
- [ ] §2.4 中所有 ✅ 交互可触发
- [ ] Markdown ↔ `.mm` 互转：往返一次（md → mm → md）后，主结构（标题层级、列表）保持一致；样式 / 图标丢失符合预期且有提示

### 6.3 性能

- [ ] 1000 节点 `.mm` 打开 < 2s，拖拽 60fps
- [ ] 10000 节点 `.mm` 打开 < 10s，可基础操作（不要求流畅动画）

### 6.4 中文 IME（与 FR-01 共用矩阵）

- [ ] 节点文本编辑中输入中文不丢字
- [ ] 节点编辑中按 Tab 不在 IME 半成品中切节点

### 6.5 安全 / 集成

- [ ] webview CSP 阻止远程 script
- [ ] 文件写入走 ITextFileService
- [ ] 外部修改 `.mm` 时不静默覆盖
- [ ] dirty / save / save as / revert / backup 全 OK
- [ ] `.mm` 文件在 Explorer 中右键 → "用思维导图打开" 与 "用源码打开" 都能工作

---

## 7. 不做项再次确认

- ❌ 实时协作 / 多人光标 / 评论
- ❌ XMind 演示模式（Pitch / Brainstorm）
- ❌ XMind 私有云同步
- ❌ Mindmap 节点级 "页面历史"（用 Git）
- ❌ MindManager `.mmap` 兼容
