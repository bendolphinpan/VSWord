# RD-12 · 扩展市场冒烟清单

- **优先级**：P1 · 发布前建议  
- **形态**：Open VSX（非 Microsoft Marketplace）+ 本地 VSIX  
- **关联**：`004` RD-12 · `docs/research/phase0-code-oss-extension-baseline.md`

---

## 前置

| 项 | 期望 |
|----|------|
| 构建 | 可启动的 Code-OSS / VSWord dev 或 portable 预览包 |
| gallery | `product.json` 指向 Open VSX（或等价）；**不要**接 MS Marketplace |
| 网络 | 能访问 `open-vsx.org`（企业网需代理文档） |

---

## 场景矩阵

| # | 场景 | 步骤 | 期望 | 结果 (pass/fail) | 备注 |
|---|------|------|------|------------------|------|
| S1 | Open VSX 搜主题 | 扩展视图搜索常见主题（如 *Dark+* / *One Dark* 类，以 VSX 实名为准）→ 安装 → 启用 | 安装成功；`Preferences: Color Theme` 可见并可切换 | | |
| S2 | 切换主题不崩 Milkdown | 打开 `.md` → 切 workbench 主题 | Milkdown 仍可用；Paper 文档主题独立不丢 | | |
| S3 | 本地 VSIX | `从 VSIX 安装…` 任选一空壳/hello 扩展 | 安装、激活、卸载无报错 | | |
| S4 | 写作向扩展 | 安装 Open VSX 上 Markdown 相关扩展（若有） | 命令面板可见；**不**强制替换 VSWord Milkdown 为默认编辑器（或可改回） | | |
| S5 | 与 Custom Editor 共存 | 保持 VSWord Markdown 为 `*.md` 默认 | 双击 `.md` 仍进 Milkdown | | |
| S6 | 失败路径文档 | 断网 / 错误 gallery | 有可理解错误；文档写明「非 MS Marketplace」 | | |

---

## 已知限制（写进用户文档时复用）

1. **扩展源是 Open VSX**，与 VS Code 商店扩展**不完全一一对应**。  
2. 依赖 Microsoft 专有服务的扩展可能不可用。  
3. 部分扩展假定默认 Markdown 预览为上游实现，可能与 Milkdown 抢编辑器关联——以 **S5** 回归为准。  

---

## 签字

| 角色 | 日期 | 签名 |
|------|------|------|
| 执行 | | |
| 复核 | | |

**Gate-R12**：S1 + S3 + S5 全 pass；S2/S4/S6 有记录（pass 或 known issue）。

---

## 命令备忘

```text
# 扩展视图 → 搜索 / 安装（UI）
# 命令面板：
#   Extensions: Install from VSIX...
#   Preferences: Color Theme
#   若被改默认编辑器：View: Reopen Editor With… → VSWord Markdown
```
