import type { Messages } from './en';

export const zhCn: Messages = {
  locale: 'zh-cn',
  lang: 'zh-CN',
  otherLocale: 'en',
  otherLocaleLabel: 'English',
  otherLocaleHref: '/ciro-code/',
  docsHref: '/ciro-code/docs/zh-cn/',
  docsOverviewHref: '/ciro-code/docs/zh-cn/getting-started/overview/',
  docsQuickstartHref: '/ciro-code/docs/zh-cn/getting-started/quickstart/',
  docsInstallHref: '/ciro-code/docs/zh-cn/getting-started/install/',
  llmsHref: '/ciro-code/docs/llms.txt',
  nav: {
    docs: '文档',
    github: 'GitHub',
    lang: '语言',
  },
  hero: {
    title: 'Ciro Code',
    tagline: '本机优先的编码 Agent。在你的机器上打开 Web 工作台，直接在项目里干活，数据留在本地。',
    ctaDocs: '阅读文档',
    ctaGithub: 'GitHub',
    copyLabel: '复制',
    copiedLabel: '已复制',
    commentInstall: '# 安装 CLI',
    commentStart: '# 启动本地工作台',
  },
  product: {
    title: '本地 Web 工作台',
    caption: '运行在本机 · http://127.0.0.1:3080',
  },
  capabilities: {
    title: '你能得到什么',
    items: [
      {
        title: '四种模式',
        body: 'Ask / Plan / Agent / Debug——每一步职责与权限边界清晰。',
      },
      {
        title: 'Rules、Skills 与 MCP',
        body: '用项目规则与 Skills 约束行为；需要时再接入 MCP 工具。',
      },
      {
        title: 'Feature Packs',
        body: '用 `ciro pack add` 从 npm 扩展能力，Kernel 仍可审计。',
      },
    ],
  },
  openCore: {
    title: 'Open Core 边界',
    p1: 'Kernel 和 CLI 完全开源，你可以审计所有本地执行逻辑。',
    p2: 'Web UI 和官方 Profile 以 npm 安装产物交付，源码不开，这是为了维持项目的可持续开发和商业闭环。',
    p3: '我们承诺：本地数据永远在你的机器上，不会未经允许上传。',
    link: '在文档中了解更多',
  },
  faq: {
    title: '常见问题',
    items: [
      {
        q: '和 Ciro Chat 有什么区别？',
        a: 'Ciro Code 是本机编码 Agent 与本地 Web 工作台；Ciro Chat 是云端聊天产品。品牌相关，运行时独立。',
      },
      {
        q: 'Windows 能用吗？',
        a: '可以。推荐 pwsh。PATH、端口 3080、ExecutionPolicy 等见安装与排障文档。',
      },
      {
        q: '会不会直接改我的代码？',
        a: 'Agent 模式可在权限策略下提出并应用修改；Ask / Plan 更偏只读与规划。',
      },
      {
        q: 'API Key 存在哪里？',
        a: '存在本机本地配置，不会未经允许上传。详见仓库 SECURITY.md。',
      },
      {
        q: '开源范围是什么？',
        a: 'Kernel 与 CLI 开源可审计；Web UI 与官方 Profile 以 npm 产物交付。数据留在本地。',
      },
    ],
  },
  quickstart: {
    title: '快速开始',
    steps: [
      { label: '安装', detail: 'npm install -g @ciro-code/code' },
      { label: '启动', detail: 'ciro web' },
      { label: '连接模型', detail: '设置 → Provider，或配置 API Key 环境变量' },
      { label: '选择工作区', detail: '打开项目目录，开始第一次会话' },
    ],
    more: '完整 Quickstart 指南',
  },
  footer: {
    blurb: 'Open Core。数据留在本地。',
    license: 'MIT',
    npm: 'npm',
    llms: 'llms.txt',
    docs: '文档',
  },
};
