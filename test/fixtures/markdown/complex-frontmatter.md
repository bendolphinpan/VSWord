---
title: VSWord 复杂样例文档
created: 2026-06-20
updated: 2026-06-24
tags: [writing, roadmap, 中文]
aliases: [vsword-sample, 样例]
status: draft
cover: assets/cover.png
customField: keep me untouched
priority: 高
reviewers: [pan, alice]
---

# VSWord 复杂样例

这是一段正文，用于验证 frontmatter 写回时**正文保持不变**。

## 列表

- 项目一
- 项目二
  - 子项

## 代码块（内含 --- 不应被误判为 frontmatter 分隔）

```yaml
---
fake: not frontmatter
---
```

## 图片资产引用

![封面](assets/cover.png)
![图示](./images/diagram.svg "示意图")

## CJK 与英文混排

中文字符与 English words 混排，用于 word count 校验。

> 引用块结尾，不应有多余空行被吃掉。
