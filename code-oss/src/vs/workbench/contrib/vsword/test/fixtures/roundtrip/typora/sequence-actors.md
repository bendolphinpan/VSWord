# Sequence actors round-trip

带显式 participant 声明 + 别名（`as`）+ 混合同步/异步/双向消息，用于验证多行内容保真。

```sequence
title: Auth flow
participant User as U
participant Server as S
participant Database as DB

U->S: POST /login
S->DB: SELECT user WHERE ...
DB-->S: row(id=42)
S-->U: 200 OK { token }
U->>S: fire-and-forget analytics
```

文档尾部还有一段普通文字，检查 fence 关闭后段落分割正确。
