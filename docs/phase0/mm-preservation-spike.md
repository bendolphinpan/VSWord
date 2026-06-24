# T-5.1 — .mm Preservation Spike

> **阶段**：Phase 5 / Mindmap
> **范围**：`.mm` parser/writer + Gate F fixtures
> **日期**：2026-06-24

---

## 1. 结论

T-5.1 采用 **VSWord 自有轻量 XML token preservation 模型**，暂不引入 `fast-xml-parser` 或其他新增依赖。

原因：
- 当前项目不应随意改 root `package.json` / `package-lock.json`。
- T-5.1 的强 Gate 是“打开 → 不改 → 保存”必须保留未知属性 / 未知子节点 / 顺序 / richcontent。
- 常规 XML object parser 容易重排属性、重写缩进或丢失未知片段。
- 本阶段只需要建立 `.mm` 结构读取与最小安全写回能力，不需要完整 XML DOM 编辑器。

---

## 2. 已实现能力

代码位置：

- `D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\common\mindmapXml.ts`
- `D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\test\node\mindmapXml.test.ts`
- `D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\test\fixtures\mindmap\`

### 2.1 Parser

`parseMindmapXml(xml)` 当前读取：

- `<node>` 层级结构
- `ID`
- `TEXT`
- `POSITION="left|right"`
- `FOLDED="true"`
- `LINK`
- `COLOR`
- `BACKGROUND_COLOR`
- `<icon BUILTIN="..." />`

### 2.2 Writer / Preservation

- `serializeMindmapXml(doc)` 对未修改文档返回原始 XML，保证 byte-for-byte round-trip。
- `updateMindmapNodeText(xml, nodeId, text)` 只替换目标 `<node ID="..." TEXT="...">` 的属性值。
- 更新文本时保留：
  - XML declaration
  - 注释
  - unknown attributes
  - unknown children
  - richcontent
  - hook/cloud 等未识别节点
  - sibling 顺序
  - 原有缩进/空白

---

## 3. Gate F Fixtures

已建立 FR-02 §6.1 所需 fixture 集：

- `freemind-basic.mm`
- `freemind-icons.mm`
- `richcontent.mm`
- `unknown-attrs.mm`
- `unknown-children.mm`
- `large-1k-nodes.mm`
- `xmind-exported.mm`

当前自动测试覆盖：

- 基础 FreeMind node 解析
- icon 解析
- unknown XML byte-for-byte round-trip
- 修改单节点 `TEXT` 不丢 unknown XML
- 7 个 fixture 全量 byte-for-byte round-trip
- 1000 direct children fixture 解析

---

## 4. 验证命令与结果

### 4.1 RED

先写测试，未实现 `mindmapXml.ts` 前运行 compile，得到预期失败：

```text
Cannot find module '../../common/mindmapXml.js'
```

### 4.2 GREEN

实现最小 parser/writer 后：

```bash
cd /d/git/vsword/code-oss
/c/Program\ Files/nodejs/npm.cmd run compile
```

结果：

```text
Finished compilation with 0 errors
Finished 'compile'
```

专项测试：

```bash
cd /d/git/vsword/code-oss
/c/Program\ Files/nodejs/node.exe test/unit/node/index.js --run src/vs/workbench/contrib/vsword/test/node/mindmapXml.test.js
```

结果：

```text
6 passing
```

---

## 5. 当前边界

T-5.1 是 parser/writer foundation，不包含完整 Mindmap UI。

未做：

- custom editor 注册
- SVG / React Flow mindmap 渲染
- 节点拖拽/增删
- layout metadata 持久化
- Markdown ↔ `.mm` 完整互转
- FreeMind / Freeplane / XMind 桌面应用真人打开验证

这些进入 T-5.2 / 后续 Gate。

---

## 6. 下一步

T-5.2 可以基于 `VSWordMindmapNode` 做只读 Mindmap MVP：

1. 注册 `.mm` 打开入口。
2. 读取 `.mm` → `VSWordMindmapNode`。
3. 渲染基础树形 / mindmap layout。
4. 再逐步接入 `updateMindmapNodeText()` 做单节点文本编辑写回。
