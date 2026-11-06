---
title: 贡献
description: 从公开仓库构建与开发。
---

源码：[github.com/Raysolid/ciro-code](https://github.com/Raysolid/ciro-code)

## 从源码开发

需要 **Node.js 20+** 与 **pnpm 9+**。

```bash
git clone https://github.com/Raysolid/ciro-code.git
cd ciro-code
pnpm install
pnpm run build
pnpm run dev:web:mock
```

| 命令 | 说明 |
|------|------|
| `pnpm run build` | 构建各包 |
| `pnpm run dev:web:mock` | 本地 API + Mock Agent |
| `pnpm run dev:web` | 本地 API + 真实模型 |
| `pnpm test` | 测试 |

仅需工作台的终端用户请用 npm 安装 — 见 [安装](/getting-started/install/)。

## 许可与安全

- [MIT License](https://github.com/Raysolid/ciro-code/blob/main/LICENSE)
- [SECURITY.md](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md) — 漏洞报告与密钥位置
