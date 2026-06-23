# FR-03 — 文件夹 Canvas（Miro 风格 + 文件即节点）

> **从属于**：`PRD-vsword-v1.md` §3.1 F-CAN-1..5
> **目标**：任意文件夹可"以 Canvas 打开"。Canvas 与 Explorer 树形并存。Canvas 中放置文件卡片、便签、图钉、贴纸、图片、网页、frame、连线等元素，对标 Miro 的视觉与交互。
> **执行者**：fullstack-developer

---

## 1. 用户故事

- 作为写作者，我右键任意文件夹 → "以 Canvas 打开"，看到该文件夹下所有文件作为卡片排在画布上，可拖动、缩放、连线、加便签。
- 作为写作者，Canvas 中的 Markdown 卡片显示标题 + 摘要 + 字数 + 首图，悬浮可滚动浏览正文，双击进入完整块编辑器。
- 作为写作者，我把一组文件用 frame 框起来命名"第一章素材"，Canvas 关闭再打开布局保持。
- 作为写作者，我把一张设计图（图片）拖入 Canvas，被自动复制到 `assets/`，节点引用相对路径。
- 作为写作者，我嵌入一个 YouTube / Bilibili 网页节点，Canvas 中可直接看视频（受 webview iframe CSP 限制）。
- 作为写作者，文件被外部移动 / 重命名 / 删除时，Canvas 卡片显示"已移动 / 已删除"标记，可一键修复或忽略。
- 作为写作者，**Canvas 数据是 JSON 文本**，可被 Code OSS 内置 Git 追踪，diff 时能看清谁改了什么。

---

## 2. 功能清单（Miro 对齐 + 范围裁剪）

> 图例：✅ P0｜🟡 P1｜⚪ P2｜❌ 不做

### 2.1 节点类型

| 节点类型 | 状态 | 说明 |
|---|:---:|---|
| **File card**（文件卡片） | ✅ | 真实文件引用（相对 workspace） |
| **Folder card**（文件夹卡片） | ✅ | 真实文件夹引用，双击下钻进入子 Canvas |
| **Note**（便签 / 文字标注） | ✅ | 仅存于 Canvas JSON，不产生真实文件 |
| **Pin**（图钉 / 标记点） | ✅ | 小圆点 + 备注，用于强调位置 |
| **Sticker**（贴纸） | ✅ | emoji / 图标贴纸库 |
| **Image**（图片） | ✅ | 引用真实图片文件，路径相对 workspace |
| **URL embed / Web**（网页节点） | ✅ | iframe 嵌入，受 webview CSP 限制 |
| **Frame**（分组框） | ✅ | 可命名、可移动、可包含其他节点 |
| **Group**（轻分组） | 🟡 | 不带边框的分组 |
| **Shape**（形状：矩形 / 圆 / 箭头形状） | 🟡 | |
| **Connector / Edge**（连线） | ✅ | 直线 / 曲线 / 折线 / 箭头 |
| **Text label on edge**（连线文字） | ✅ | |
| **Sticky note 风格便签**（彩色） | ✅ | Note 的样式变体 |
| **Mind map 节点** | ❌ | 用 `.mm` 文件 + 双击 |
| **Kanban / Board** | ⚪ | P2 |
| **Voting / Timer** | ❌ | 协作专用，不做 |
| **Iframe app（Miro app store）** | ❌ | 不做 |

### 2.2 文件卡片预览

| 文件类型 | 预览内容 | 卡片内可编辑 |
|---|---|---|
| `.md` | 标题 + frontmatter 摘要 + 首图 + 字数 + 首段正文（可滚动浏览全文） | 标题、checkbox 勾选、tag 编辑（轻量） |
| `.mm` | 思维导图缩略图 + 根节点文本 + 节点数 | ❌（双击进入） |
| `.png/.jpg/.svg/.webp` | 图片本体 | ❌ |
| `.pdf` | 第一页缩略图 + 页数 | ❌（P1） |
| `.txt` | 前 N 行 | ❌ |
| `.json/.yaml/.toml` | 语法高亮前 N 行 | ❌ |
| 子文件夹 | 子项数量 + 最近修改 + 4 个子文件名预览 | ❌（双击进入子 Canvas） |
| 未知类型 | 文件图标 + 大小 + 修改时间 | ❌ |

**重度编辑**：双击文件卡片 → 在新编辑器组打开真实文件（块编辑器 / 思维导图编辑器 / Monaco）。

### 2.3 交互（对齐 Miro）

| 交互 | 状态 |
|---|:---:|
| 平移画布（空格 + 拖 / 中键拖 / 触控板双指） | ✅ |
| 缩放（Ctrl + 滚轮 / 触控板 pinch） | ✅ |
| 框选 / Shift 多选 | ✅ |
| 拖动节点 | ✅ |
| 节点对齐 / 智能吸附（snap to grid / snap to other nodes） | ✅ |
| 节点等距对齐（distribute） | 🟡 |
| 复制 / 粘贴节点 | ✅ |
| 撤销 / 重做 | ✅ |
| 拖拽外部文件 / 图片到 Canvas | ✅ 关键 |
| 拖拽 URL 到 Canvas → 自动建 URL 节点 | ✅ |
| 节点右键菜单（复制 / 删除 / 锁定 / 置顶） | ✅ |
| 节点锁定（不可拖动） | ✅ |
| 节点 Z 序（置顶 / 置底） | ✅ |
| 节点透明度 / 颜色 | ✅ |
| 连线智能路由（避让节点） | 🟡 |
| 连线锚点（顶 / 底 / 左 / 右 / 自动） | ✅ |
| Mini-map（缩略导航） | ✅ |
| 缩放控件 / 适应窗口 / 100% | ✅ |
| 工具栏（左侧或顶部） | ✅ |
| 网格 / 标尺背景 | ✅ |
| 演示模式 / Frame 间跳转 | 🟡 |
| 评论 / 反馈贴纸 | ❌ PRD W-3 |
| 多人光标 / Presence | ❌ PRD W-1 |
| 投票 / 计时器 | ❌ |

### 2.4 文件系统联动（核心差异点）

VSWord Canvas 与 Miro 最大不同：**节点可以是真实文件引用**。Canvas 不是文件系统本体，必须把"从画布移除"和"删除磁盘文件"拆开。

| 文件操作 | Canvas 行为 |
|---|---|
| 文件被外部重命名 | 卡片显示"已重命名 → newName"标记，提供"自动修复引用" / "忽略"操作 |
| 文件被外部移动到其他目录 | 卡片显示"已移动"标记，提供"修复引用" / "删除节点" |
| 文件被外部删除 | 卡片显示"已丢失"红色边框，提供"删除节点" / "在原位置创建空文件恢复" |
| 文件内容被外部修改 | 卡片预览自动刷新（debounce） |
| 在 Canvas 中删除文件/文件夹卡片 | **只从 Canvas 移除节点，不删除真实文件/文件夹**；被移除但仍存在于当前文件夹的文件进入"暂存盘/未上画布" |
| 从暂存盘恢复 | 将文件/文件夹重新放回 Canvas，创建新的 file/folder 节点并写入 `.vsword/canvas.json` |
| 从暂存盘真实删除 | 二次确认后删除磁盘文件/文件夹；优先使用系统回收站/Trash，无法使用时必须明确提示"永久删除" |
| 在 Canvas 中"新建文件卡片" | 通过 IFileService 创建真实文件 + 立即建 Canvas 节点 |
| 拖入/粘贴文件到 Canvas | 将文件写入当前 Canvas 对应文件夹（或其 `assets/` 子目录）+ 立即创建 Canvas 节点 |

#### 2.4.1 暂存盘 / 未上画布 / 回收站语义

P0 统一名称暂定为 **暂存盘**，UI 可显示为：

```text
暂存盘
这些文件在当前文件夹中存在，但没有显示在 Canvas 上
```

暂存盘不是独立数据源，P0 由系统实时计算：

```text
当前文件夹直接子项 - canvas.json 中现有 file/folder 节点引用 = 暂存盘条目
```

规则：

- ✅ 删除 Canvas 上的 file/folder 节点：只修改 `.vsword/canvas.json`，真实文件进入暂存盘列表。
- ✅ 暂存盘点击"放回 Canvas"：在当前视口中心或用户指定位置创建节点。
- ✅ 暂存盘点击"真实删除"：删除磁盘文件/文件夹，并从暂存盘消失。
- ✅ 暂存盘支持多选恢复 / 多选真实删除。
- ✅ 如果文件已经被外部删除，暂存盘不再显示该文件；已有 Canvas 节点按"丢失文件"状态显示。
- ✅ 子文件夹从 Canvas 移除后，也进入暂存盘；恢复后仍是 folder card，可双击下钻。
- ❌ P0 不做复杂版本历史；误删恢复依赖系统回收站、Git、Timeline 或 Local History。
- ❌ P0 不把 Note / Pin / Sticker 等纯 Canvas 对象放入暂存盘；这些对象删除即从 canvas.json 删除，后续由 Undo/Redo 覆盖。

#### 2.4.2 暂存盘 UI

P0 UI 入口：

- Canvas 右侧或底部浮层按钮：`暂存盘 (N)`；N = 当前文件夹中未上画布的直接子项数量。
- 点击打开面板，列表显示：文件名、类型、相对路径、大小/修改时间（可先只显示文件名 + 类型）。
- 每个条目操作：`放回 Canvas`、`真实删除…`。
- 面板顶部操作：`全部放回`、`刷新`。
- 暂存盘为空时显示：`当前文件夹中的文件都已在 Canvas 上`。

#### 2.4.3 拖拽 / 粘贴加入 Canvas 和文件夹

目标语义：**加入 Canvas 的同时，必须保证文件也存在于当前 Canvas 对应文件夹内**。

| 输入来源 | P0 行为 |
|---|---|
| 从 OS 文件管理器拖入文件 | 复制到当前 Canvas 文件夹；图片可默认复制到 `assets/`；随后创建节点 |
| 从 VSWord Explorer 拖入当前文件夹内文件 | 不复制文件，只创建/恢复 Canvas 节点 |
| 从 VSWord Explorer 拖入其他文件夹文件 | 默认复制到当前 Canvas 文件夹，再创建节点 |
| 粘贴文件（剪贴板文件列表） | 复制到当前 Canvas 文件夹，再创建节点 |
| 粘贴图片数据 | 写入 `assets/pasted-YYYYMMDD-HHMMSS.png`，再创建 image/file 节点 |
| 粘贴文本/URL | P0 可创建 note/url 节点；如果无法可靠识别 URL，则先创建 note |

冲突处理：

- 同名文件冲突：自动追加 `-1`, `-2`，例如 `image.png` → `image-1.png`。
- 多文件拖入/粘贴：按网格排布到 drop/paste 坐标附近。
- 复制失败：不创建 Canvas 节点，并弹出错误提示。
- webview 不能直接写盘，必须通过 host 消息 + IFileService 写入。

### 2.5 Frame（分组框）

- Frame 是命名的矩形容器，可包含任意节点。
- 移动 Frame 时，**包含的节点跟随移动**。
- Frame 可嵌套。
- Frame 大小可手动调整或自动适应内容。
- Frame 不影响真实文件夹结构（与 folder card 不同）。

### 2.6 文件夹即 Canvas 的语义

- 每个 workspace 文件夹**可以**有一个对应的 Canvas（默认无）。
- 用户首次"以 Canvas 打开"该文件夹时，VSWord 自动生成 Canvas，把当前文件按网格排列。
- Canvas 与 Explorer 视图**并存**：用户可以选择默认打开 Canvas 还是 Explorer，或两者并排。
- 子文件夹卡片**双击下钻** → 切换为该子文件夹的 Canvas（如同 Miro 的 frame 但是真实目录）。

---

## 3. 数据模型与存储

### 3.1 文件位置

```text
.vsword/
└── canvas/
    ├── index.json                              # folder URI → canvas file 映射
    ├── _root.canvas.json                       # 工作区根目录的 Canvas
    └── docs__chapter1.canvas.json              # docs/chapter1 文件夹的 Canvas
```

文件名规则：folder relative path 的 `/` 替换为 `__`，避免嵌套子目录。

### 3.2 Canvas Schema

```ts
interface VswordCanvasDocument {
  schemaVersion: 1;
  id: string;                                   // 稳定 UUID
  workspaceRoot: string;                        // 相对 workspace 的标识，便于跨机器
  folderUri: string;                            // workspace-relative
  title?: string;
  viewport: { x: number; y: number; zoom: number };
  background?: {
    type: 'grid' | 'dots' | 'plain';
    gridSize?: number;
    color?: string;
  };
  nodes: VswordCanvasNode[];
  edges: VswordCanvasEdge[];
  metadata?: Record<string, unknown>;
  updatedAt: string;
}

interface VswordCanvasNode {
  id: string;
  type: 'file' | 'folder' | 'note' | 'pin' | 'sticker'
      | 'image' | 'url' | 'frame' | 'shape';
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex?: number;
  locked?: boolean;
  rotation?: number;
  style?: {
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
    opacity?: number;
    color?: string;
    fontSize?: number;
    fontFamily?: string;
  };
  data: {
    // file/folder/image: 引用 workspace-relative path
    uri?: string;
    // url: 嵌入网址
    url?: string;
    // note/sticker/pin: 文本内容
    text?: string;
    // sticker: 内置图标 ID
    icon?: string;
    // frame: 名称
    name?: string;
    // frame: 包含节点 ID 列表
    children?: string[];
    // 文件卡片预览选项
    preview?: {
      mode: 'compact' | 'expanded';
      showThumbnail?: boolean;
    };
  };
  createdAt: string;
  updatedAt: string;
}

interface VswordCanvasEdge {
  id: string;
  source: string;
  sourceAnchor?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  target: string;
  targetAnchor?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  type: 'straight' | 'curve' | 'orthogonal';
  arrow?: 'none' | 'end' | 'both';
  label?: string;
  style?: {
    color?: string;
    width?: number;
    dashed?: boolean;
  };
}
```

### 3.3 Schema 演进

- `schemaVersion` 必须递增。
- VSWord 启动时检测 `.canvas.json` 的 schemaVersion，需要时迁移并备份原文件到 `.vsword/canvas/.backup/`。

### 3.4 Git 友好

- 节点 / 边数组按 ID 字典序输出，避免每次保存 diff 漂移。
- 浮点坐标 round 到整数。
- 时间戳 `updatedAt` 仅在内容真变化时更新。

---

## 4. 技术约束

| 项 | 约束 |
|---|---|
| UI 承载 | Custom Editor + Webview，URI scheme `vsword-canvas://<folder>` |
| 渲染库（MVP 选其一） | **tldraw**（自由白板优先）或 **React Flow**（关系图优先）。Phase 0 Task 0.11 决定 |
| 数据模型 | **VSWord 自有 schema**，渲染库 schema 仅作 UI 状态 |
| 文件预览 | Markdown 用 unified 解析；图片直接 `<img>`；PDF 用 pdf.js（P1）；都通过 `asWebviewUri` |
| 文件监听 | `IFileService.onDidFilesChange` |
| 文件写入 | 走 IFileService / ITextFileService，webview 不直接写盘 |
| iframe（URL 节点） | 严格 CSP；默认 sandbox `allow-scripts allow-same-origin`；用户白名单可放宽 |
| 性能 | 100 节点 60fps；500 节点流畅；1000 节点降级（关动画 / LOD） |
| 许可证 | tldraw（Apache 2.0 + 商用条款，需复核）/ React Flow（MIT） |

---

## 5. 边界与陷阱

### 5.1 Canvas 与 Explorer 的关系

- **不替代**：Explorer 仍是默认视图。
- 设置项：`vsword.canvas.openFolderAs`，可选 `explorer` / `canvas` / `ask`，默认 `explorer`。
- 文件夹右键菜单：`Open as Canvas` / `Open as Explorer`。

### 5.2 子文件夹卡片下钻

- 双击子文件夹卡片 → 切换当前编辑器内容为该子 Canvas（**不开新 tab**，避免 tab 爆炸）。
- 提供面包屑导航返回上级。
- 也支持 Ctrl+双击 → 在新 tab 打开子 Canvas。

### 5.3 拖入文件去重

- 同一 workspace 文件多次被拖入：P0 默认恢复/创建一个节点；后续可支持"同一文件在 Canvas 多个位置"。
- 拖入当前 Canvas 文件夹外的文件：P0 默认复制到当前 Canvas 文件夹，避免 canvas 引用散落到外部绝对路径。
- 文件名冲突必须自动改名，不覆盖用户已有文件。
- 从暂存盘恢复时，如果该文件已经被外部移动/删除，必须刷新暂存盘并提示，不创建坏引用。

### 5.4 网页节点 CSP 风险

- 默认 sandbox 阻止 top-navigation、阻止 popups。
- 部分网站（YouTube / Bilibili）支持 iframe；部分（Twitter / Notion 等）禁止。MVP 不绕过，弹提示"该网站禁止嵌入"。

### 5.5 性能降级

- 节点 > 200 时，关闭节点拖动时的"实时预览刷新"，只在 drop 时刷新。
- 节点 > 500 时，进入 LOD 模式：缩放 < 50% 时只显示节点轮廓 + 名称。
- 节点 > 1000 时，禁用动画。

### 5.6 Frame 嵌套深度

- 不限制 Frame 嵌套，但 UI 上深度 > 5 给警告。

### 5.7 中文输入

- Note / Sticker / Pin 文本编辑必须支持 IME。
- 节点重命名 / Frame 命名同上。

---

## 6. 验收清单（fullstack-developer 自测必须全过）

### 6.1 节点类型

- [ ] §2.1 中所有 ✅ 节点类型可创建、编辑、删除、复制
- [ ] File card 双击进入对应文件本体编辑器
- [ ] Folder card 双击切换到子 Canvas
- [ ] Image / URL / 网页节点正确渲染
- [ ] Frame 移动时子节点跟随
- [ ] Edge 在节点移动时正确跟随重新路由

### 6.2 文件预览（§2.2）

- [ ] `.md` 卡片显示标题 + 摘要 + 字数 + 首图
- [ ] `.mm` 卡片显示思维导图缩略图（可用占位图 + 节点数）
- [ ] 图片卡片显示本体
- [ ] 子文件夹卡片显示子项数 + 最近修改

### 6.3 文件系统联动（强阻塞 §2.4）

- [ ] 外部重命名文件 → 卡片显示"已重命名"
- [ ] 外部删除文件 → 卡片显示"已丢失"红色边框
- [ ] 外部移动文件 → 卡片显示"已移动"
- [ ] 外部修改文件内容 → 卡片预览刷新（≤2s）
- [ ] Canvas 删除节点默认不删真实文件
- [ ] 被删除但仍存在的文件/文件夹出现在暂存盘
- [ ] 暂存盘可将文件/文件夹放回 Canvas，reload 后仍存在
- [ ] 暂存盘真实删除文件/文件夹前有二次确认，删除后磁盘与暂存盘均更新
- [ ] Canvas 新建文件卡片创建真实文件
- [ ] 拖拽文件进入 Canvas 会写入当前文件夹并创建节点
- [ ] 粘贴文件/图片进入 Canvas 会写入当前文件夹或 assets 并创建节点

### 6.4 交互（§2.3）

- [ ] 所有 ✅ 交互可正常使用
- [ ] 撤销 / 重做覆盖：移动、增删、连线、改样式、改 frame
- [ ] 拖拽外部文件 / URL 进入 Canvas 正确建节点；文件类输入必须同时写入当前 Canvas 文件夹
- [ ] Mini-map 反映视口位置

### 6.5 数据持久化

- [ ] Canvas JSON 在 `.vsword/canvas/` 下生成，schemaVersion=1
- [ ] 关闭重开布局完全恢复（位置、缩放、视口、节点、边）
- [ ] 节点数组按 ID 排序，相同操作不应产生 diff 漂移（Git 友好测试）

### 6.6 性能

- [ ] 100 节点 60fps 拖拽
- [ ] 500 节点流畅（>30fps）
- [ ] 1000 节点可打开（不要求流畅）

### 6.7 安全 / 集成

- [ ] webview CSP 阻止远程 script（除显式 URL embed）
- [ ] iframe sandbox 配置正确
- [ ] 文件写入全部走 IFileService
- [ ] 外部修改 Canvas JSON 时不静默覆盖
- [ ] 文件夹右键菜单"Open as Canvas"出现
- [ ] 命令面板 `vsword.openFolderCanvas` 可执行

### 6.8 与 Git 协作

- [ ] `.vsword/canvas/*.json` 在 Source Control 视图中可见
- [ ] 修改一个节点位置后保存 → diff 仅显示该节点（验证排序稳定）

---

## 7. 不做项再次确认

- ❌ 实时多人协作（PRD W-1）
- ❌ Comments / Voting / Timer / Presence
- ❌ Miro App Store iframe apps
- ❌ Canvas 自带"页面历史"——用 Code OSS Source Control（Git）+ Timeline 视图
- ❌ 云端 Canvas 模板库
