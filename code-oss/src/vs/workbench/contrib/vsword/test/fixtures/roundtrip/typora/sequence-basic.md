# Sequence basic round-trip

一个最小的 js-sequence-diagrams 图：两个 actor + 一条同步消息。用于校验 code_block fence 保真。

```sequence
title: Basic hello
Alice->Bob: Hi Bob
Bob-->Alice: Hello Alice
```

行尾附加中文，验证 fence 前后段落不受影响。
