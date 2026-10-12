---
title: MCP 工具集成
description: 在 Ciro Code 中连接并使用 Model Context Protocol (MCP) 服务。
---

**Model Context Protocol (MCP)** 是开放的外部工具标准。通过接入 MCP 服务器，你可以为 Ciro Code 扩展数据库查询、浏览器自动化操作、企业内部 API 调用等强大能力。

---

## 配置 MCP 服务器

MCP 配置保存在用户级配置文件 `~/.ciro/mcp.json` 中，或者直接在工作台 **设置 → MCP 工具** 界面中添加。

### 配置文件范例 (`~/.ciro/mcp.json`)

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"],
      "env": {
        "PUPPETEER_HEADLESS": "true"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"],
      "env": {}
    },
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

---

## 会话级激活控制

为了防止工具过多导致模型推理注意力分散与上下文浪费，Ciro Code 默认采用**会话级按需挂载**机制：

1. **全局注册**：在设置或 `mcp.json` 中配置好所有可用的 MCP 服务器。
2. **会话启用**：在新建会话时，在底部的输入框工具栏（或点击 **+** 菜单）勾选本次对话需要调用的 MCP 服务。
3. **动态生效**：启用后的服务所提供的工具（Tools）与资源（Resources）将按当前工作模式（Ask / Plan / Agent）对齐暴露。

---

## 安全与沙箱边界

MCP 工具的执行依然受到 Ciro Code 安全架构的严格监管：

- **策略审计**：MCP 工具发起的任何本地文件读写与命令，均会穿透至当前工作区的策略沙箱（Policy Sandbox）进行检查。
- **本地密钥隔离**：MCP 所需的第三方 Token 仅存留在本机环境中，不会随会话历史被记录或发送至大模型之外的端点。
- **杜绝隐蔽出网**：系统不提供不受信的云端公共 MCP 市场，仅连接你明确配置并在本机启动的可信进程。
