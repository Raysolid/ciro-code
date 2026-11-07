---
title: 开源 Kernel
description: 从公开仓库构建与研读 MIT 开源的 Kernel 与 CLI。
---

源码：[github.com/Raysolid/ciro-code](https://github.com/Raysolid/ciro-code)

本仓库包含 **开源 Kernel**：共享类型、策略/会话、Agent 运行时、HTTP+SSE API、CLI，以及 Rules / Skills / MCP 接入与相关测试。开源范围见 [开源范围与承诺](/open-core/what-is-open/)。日常安装产品见 [安装](/getting-started/install/)。

## 构建

需要 **Node.js 20+** 与 **pnpm 9+**。

```bash
git clone https://github.com/Raysolid/ciro-code.git
cd ciro-code
pnpm install
pnpm run build
pnpm test
```

| 命令 | 说明 |
|------|------|
| `pnpm run build` | 构建开源包 |
| `pnpm run dev:web:mock` | 本机 API + Mock Agent |
| `pnpm run dev:web` | 本机 API + 真实模型 |
| `pnpm test` | 测试 |

冒烟 CLI：

```bash
pnpm --filter @ciro-code/cli exec node dist/cli.js --help
pnpm --filter @ciro-code/cli exec node dist/cli.js web --mock --no-open -w .
```

健康检查默认：[http://127.0.0.1:5280/health](http://127.0.0.1:5280/health)。

## 许可与安全

- [MIT License](https://github.com/Raysolid/ciro-code/blob/main/LICENSE)
- [SECURITY.md](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md) — 漏洞报告与密钥位置
