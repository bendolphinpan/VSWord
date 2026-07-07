```sequence
title: Auth flow
participant User as U
participant Server as S
participant Database as DB

U->S: POST /login
S->DB: SELECT user WHERE ...
DB-->S: row(id=42)
S-->U: 200 OK { token }
```
