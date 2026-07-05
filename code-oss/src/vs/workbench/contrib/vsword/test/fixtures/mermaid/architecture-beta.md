```mermaid
architecture-beta
  group api(cloud)[API]
  service db(database)[DB] in api
  service web(server)[Web] in api
  web:R --> L:db
```
