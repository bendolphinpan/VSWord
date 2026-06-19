# VSWord Copilot/Chat 默认禁用报告

日期：2026-06-19

## 范围

- 工作区：`D:\GIT\VSWord`
- 源码目录：`D:\GIT\VSWord\code-oss`
- 目标任务：Phase 1 / T-1.3

## 决策

保留 Copilot/Chat 相关源码、扩展点和未来接入能力；仅从产品默认配置中取消 GitHub Copilot/Chat 的默认代理、默认受信任授权和内置自动更新启用项。

## 本次 product.json 改动

- 删除 `defaultChatAgent` 中 GitHub Copilot / Copilot Chat 默认代理配置。
- 将 `trustedExtensionAuthAccess` 改为空对象，取消默认授予 `GitHub.copilot-chat` 的 GitHub 授权白名单。
- 将 `builtInExtensionsEnabledWithAutoUpdates` 改为空数组，取消默认自动启用/自动更新 `GitHub.copilot-chat`。

## 保留项

- 未删除 `extensions/copilot/` 源码目录。
- 未删除 workbench 中 chat / language model 相关扩展点。
- 未禁用用户后续手动安装或未来替换为 VSWord 自家 AI 助理的能力。

## 验证记录

### JSON 校验

命令：

```sh
node -e "JSON.parse(require('fs').readFileSync('product.json','utf8')); console.log('product.json OK')"
```

实际输出：

```text
product.json OK
```

### grep 结论

命令：

```sh
git grep -n -E "defaultChatAgent|trustedExtensionAuthAccess|builtInExtensionsEnabledWithAutoUpdates|GitHub\.copilot|GitHub\.copilot-chat|github\.copilot" -- product.json src/vs/workbench extensions/copilot
```

结论：

- `product.json` 不再包含 `defaultChatAgent`。
- `product.json` 仍保留 `trustedExtensionAuthAccess` 与 `builtInExtensionsEnabledWithAutoUpdates` 键，但值分别为空对象/空数组。
- `extensions/copilot/` 仍有大量 Copilot 文档、配置、命令和源码引用，这是刻意保留扩展点/源码的结果，不属于默认启用。

## 风险说明

Product-only 策略不移除源码，因此开发源码树中 Copilot 相关文件仍可被搜索到；本阶段目标是“默认禁用但保留扩展点”，不是彻底移除。若后续需要完全白牌化，需要单独立项处理图标、文案、内置扩展清单和 marketplace 分发策略。
