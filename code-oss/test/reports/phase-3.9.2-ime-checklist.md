# T-3.9.2 · IME 检查表 · v1（骨架，待人肉填充）

- 环境：Windows 10.0.26200.8655
- VSWord commit：3ebd7a69da0512e381b850a846e39b4f03b97a04
- PRD：`docs/requirements/phase-3.9-perf-ime.md` §4.3
- Kanban 任务：t_c7c97894（T-3.9.2.a）
- 日期：待填（人肉跑完时填 UTC ISO 8601）
- 状态：**⏸ 骨架已产出，等待真人在开发机上跑 14 组 IME × 键盘用例并勾选**

---

## 检查步骤（每组组合都跑一遍）

1. 启动 VSWord（Code-OSS 主进程 + Milkdown webview）
2. 打开一个空白 `.md` 文件；确认 Milkdown 编辑器已 focus
3. 切换到目标 IME（Win+空格 / Ctrl+Shift）
4. 按 "用例" 列的操作序列打字；对照 "期待" 判定
5. 每组勾 ✅ / ❌ 并在 "观察" 列写现象（光标位置、候选框行为、有无异常延迟等）
6. 打开 Output panel → VSWord 日志通道，确认 composition 期间**没有** auto-save 触发日志（PRD §4.3 期待）；若不好观察可临时在 `milkdownEditor.ts` 里 `console.log('[auto-save] triggered')` 加日志（跑完删掉，不要提交）

---

## 检查矩阵

| # | 平台/IME | 用例 | 不丢字 | 不重复 | 不打断保存 | 观察 |
|---|---|---|---|---|---|---|
| 1 | 微软拼音 | 段中输入 "你好世界" | ⬜ | ⬜ | ⬜ | |
| 2 | 微软拼音 | 段尾输入 "你好世界" | ⬜ | ⬜ | ⬜ | |
| 3 | 微软拼音 | 候选切换（"zhongguo" 选第 3 候选） | ⬜ | ⬜ | ⬜ | |
| 4 | 微软拼音 | 快速连打 20 字中文段落 | ⬜ | ⬜ | ⬜ | |
| 5 | 搜狗拼音 | 段中输入 "你好世界" | ⬜ | ⬜ | ⬜ | |
| 6 | 搜狗拼音 | 段尾输入 "你好世界" | ⬜ | ⬜ | ⬜ | |
| 7 | 搜狗拼音 | 候选切换（"zhongguo" 选第 3 候选） | ⬜ | ⬜ | ⬜ | |
| 8 | 搜狗拼音 | 快速连打 20 字中文段落 | ⬜ | ⬜ | ⬜ | |
| 9 | Google 日文 IME | 平假名→汉字转换（"nihongo" → 日本語） | ⬜ | ⬜ | ⬜ | |
| 10 | Google 日文 IME | 退格取消 composition | ⬜ | ⬜ | ⬜ | |
| 11 | Google 日文 IME | 快速连打 | ⬜ | ⬜ | ⬜ | |
| 12 | Google 日文 IME | 段中输入 | ⬜ | ⬜ | ⬜ | |
| 13 | MS Korean | 段中输入 "안녕하세요" | ⬜ | ⬜ | ⬜ | |
| 14 | MS Korean | 快速连打 | ⬜ | ⬜ | ⬜ | |

**记号约定**：⬜ = 未跑；✅ = 通过；❌ = 失败（在观察列写复现步骤：击键序列 + 期望结果 + 实际结果）。

---

## IME 版本信息（填表前采集）

- Windows 版本：Windows 10.0.26200.8655
- 微软拼音版本：（打开 "设置 → 时间和语言 → 语言 → 中文（简体，中国）→ 语言选项 → 微软拼音 → 选项 → 关于"）：待填
- 搜狗拼音版本：（Fn 菜单 → 关于）：待填
- Google 日文 IME 版本：（任务栏 IME 图标右键 → プロパティ → バージョン情報）：待填
- MS Korean 版本：（Windows 系统 IME，标注 Windows 版本即可）：Win 10.0.26200.8655

---

## 若发现 ❌

- 在观察列写详细复现步骤（击键序列 + 期望 + 实际）
- 走 `kanban_comment(task_id="t_c7c97894", body="fail: #N 组 <详情>")`
- 走 `kanban_block(reason="待 dev 修复 T-3.9.2.d 后回归 #N 组合")`
- PM 会派 T-3.9.2.d dev 卡修复，修完再回归打勾

---

## 汇报（跑完后追加）

- 通过率：⬜/14
- 报告路径：`code-oss/test/reports/phase-3.9.2-ime-checklist.md`
- Push 状态：待填（勾完 → commit → push origin/dev）
- 结尾：**review-required · 请派 3.9.2.d 或归档**
