---
title: 产品概览
description: Ciro Code 的产品定位、设计哲学与核心架构。
---

Ciro Code 是 **本地优先** 的 AI 编码 Agent Harness，直接在你的本地项目与文件系统上工作。

不同于将源码上传至云端的辅助工具，Ciro Code 在你的机器上运行轻量执行引擎与 Web 工作台，由你掌控每一次工具调用、文件改动与执行边界。

- **零数据外溢**：源码、Git diff、模型密钥与会话历史全部留在本地磁盘（`{workspace}/.ciro/` 与 `~/.ciro/`）。仅向你配置的 LLM 发起推理请求，工具本身绝不擅自出网。
- **四档权限沙箱**：提供 `Ask`、`Plan`、`Agent` 与 `Debug` 四种工作模式，按需限制只读或写操作，规避误改风险。
- **Open Core 可信审计**：执行核心（Kernel 与 CLI）采用 MIT 协议开源，完全透明可审；Web 工作台免费随 npm 包交付。详见 [开源范围与承诺](/open-core/what-is-open/)。

建议先查看 [安装指南](/getting-started/install/) 完成环境准备，随后前往 [快速开始](/getting-started/quickstart/) 体验第一次会话。

## 四档工作模式

模式决定了 Agent 在会话中的行为准则与工具调用权限（模型可在工作台设置中独立选择）：

| 场景与目标 | 模式 | 权限与行为特征 |
|------------|------|----------------|
| 摸清仓库架构、分析实现原理、不改动代码 | **Ask** | **严格只读**，仅开放文件检索与读取工具，安全探索无风险 |
| 复杂重构、方案设计、动手前先理清思路 | **Plan** | **规划导向**，分解多阶段实施步骤，杜绝无策略修改 |
| 落实功能特性、修改代码、执行自动化测试 | **Agent** | **全功能模式**，在工作区沙箱与审批策略下读写文件、执行命令 |
| 复现 Bug、排查失败用例、诊断系统缺陷 | **Debug** | **假设驱动诊断**，快速定位根因并最小化改动影响面 |

详细机制见 [工作模式指南](/guides/modes/)。

## 模块化扩展：Feature Packs

Ciro Code 遵循 Unix 哲学，保持 Kernel 精炼稳定，同时支持通过 npm 生态扩展功能：

- 运行 `ciro pack add @ciro-code/ext-git` 即可为工作台添加 Git diff 可视化面板。
- 所有 Feature Pack 均安装于用户全局目录 `~/.ciro/packs/`，不污染项目本身的 `package.json`。
- 安装后需在「设置 → Feature packs」中显式开启，安全可控。详见 [扩展 Pack](/guides/packs/)。

## 隐私与安全边界

Ciro Code 将安全与隐私置于首位：
- 本地配置存储在 `~/.ciro/config.yaml` 与 `{workspace}/.ciro/` 中。
- 敏感 API Key 仅保存在本机环境中，网络出网受严格策略沙箱约束。
- 详细开源边界说明请参阅 [开源范围与承诺](/open-core/what-is-open/)；完整漏洞披露政策请参阅仓库 [SECURITY.md](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md)。
