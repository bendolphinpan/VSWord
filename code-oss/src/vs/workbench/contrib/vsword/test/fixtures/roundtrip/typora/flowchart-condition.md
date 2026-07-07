# Flowchart condition round-trip

带条件分支的 flowchart.js 图：condition 节点 + yes/no 分支 + 子路径。用于验证多行内容保真。

```flow
st=>start: Start
op1=>operation: Load data
cond=>condition: Data valid?
op2=>operation: Process
op3=>operation: Report error
e=>end: End

st->op1->cond
cond(yes)->op2->e
cond(no)->op3->e
```

文档尾部还有一段普通文字，检查 fence 关闭后段落分割正确。
