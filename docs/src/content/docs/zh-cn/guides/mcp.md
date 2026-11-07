---
title: MCP 工具
description: 连接本机 MCP 服务器，按会话启用外部工具。
---

MCP（Model Context Protocol）把**外部工具进程**接到 Agent。适合 Issue、浏览器、数据库等**仓库外**能力。  
本机 `git` / 测试命令优先靠默认 Shell + [权限](/guides/permissions/)；提示词用 [Rules / Skills](/guides/rules-skills/)。选型见 [如何选择扩展方式](/customize/chooser/)。

## 开始前

- 已能打开工作台或 TUI  
- 只添加你信任、本机可启动的 MCP 命令

## 配置

保存在 `~/.ciro/mcp.json`，或 **设置 → MCP 工具**。

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed"]
    }
  }
}
```

Token 用环境变量注入，不要写进仓库。示例（示意）：

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
      }
    }
  }
}
```

## 会话级启用

1. 在设置 / `mcp.json` **注册**服务器  
2. 开新会话时在 Composer 工具栏或 **+** 菜单**勾选**本次要用的 MCP  
3. 工具按当前 [模式](/guides/modes/) 暴露；未勾选的不占上下文

Skill 若声明 `requiresMcp`，会话未启用对应 MCP 时该 Skill 会被跳过。

## 安全边界

- MCP 触发的读写 / 命令仍走工作区策略与审批  
- 无官方「任意公共 MCP 市场」代你拉未知进程——只连你显式配置的本机命令  
- 密钥留本机；见 [安全](/trust/security/)

## 成功时你应看到

- 设置里服务器列表可用  
- 会话勾选后模型能调用该 MCP 工具  
- 未勾选时工具不可用、上下文更干净

## 失败时

- 进程起不来 → 本机直接跑同样的 `command` / `args` 看报错  
- 权限拒绝 → [权限](/guides/permissions/)  
- Skill 不生效 → 查 `requiresMcp` 是否已在会话启用

## 接下来

[规则与 Skills](/guides/rules-skills/) · [Feature Packs](/guides/packs/) · [安全](/trust/security/)
