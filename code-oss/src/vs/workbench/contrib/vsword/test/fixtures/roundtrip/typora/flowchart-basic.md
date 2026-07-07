# Flowchart basic round-trip

一个最小的 flowchart.js 图：start → operation → end。用于校验 code_block fence 保真。

```flow
st=>start: Start
op=>operation: My Operation
e=>end: End

st->op->e
```

行尾附加中文，验证 fence 前后段落不受影响。
