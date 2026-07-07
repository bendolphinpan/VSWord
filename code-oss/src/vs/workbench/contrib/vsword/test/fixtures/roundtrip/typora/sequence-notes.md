# Sequence notes & mixed round-trip

## 空图占位符

一个语义为空的 sequence 图（仅空白），编辑器会展示占位符；round-trip 时源码需要**原样返回**（仅 trim 尾部纯空白行）。

```sequence

```

## 带 Note 的图

`Note left/right/over` 三种位置，验证注释语法保真。

```sequence
title: With notes
participant A
participant B
Note left of A: 客户端只做校验
A->B: 请求
Note right of B: 服务端命中缓存
B-->A: 响应
Note over A,B: 事务完成
```

## 混合语言

同一文档里 sequence 与非 sequence 代码块共存。

```js
console.log('hello');
```

```sequence
title: minimal
A->B: hi
```
