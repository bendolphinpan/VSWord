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
