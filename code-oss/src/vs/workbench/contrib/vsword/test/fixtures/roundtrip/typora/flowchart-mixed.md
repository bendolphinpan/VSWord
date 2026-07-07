# Flowchart empty & parallel round-trip

## 空图占位符

一个语义为空的 flow 图（仅空白），编辑器会展示占位符；round-trip 时源码需要**原样返回**（仅 trim 尾部纯空白行）。

```flow

```

## 平行结构

多条 operation 顺序流：验证多节点连线保真。

```flow
st=>start: 开始
op1=>operation: 步骤 A
op2=>operation: 步骤 B
op3=>operation: 步骤 C
e=>end: 结束

st->op1
op1->op2
op2->op3
op3->e
```

## 混合语言

同一文档里 flow 与非 flow 代码块共存。

```js
console.log('hello');
```

```flow
st=>start: Start
e=>end: End
st->e
```
