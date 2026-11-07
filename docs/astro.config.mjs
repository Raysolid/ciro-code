import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { rehypeBaseLocaleLinks } from './plugins/rehype-base-locale-links.mjs';

/** @type {import('@astrojs/starlight/types').StarlightUserConfig['sidebar']} */
const sidebar = [
  {
    label: 'Get started',
    translations: { 'zh-CN': '开始使用' },
    items: [
      { label: 'What is Ciro Code', translations: { 'zh-CN': '产品概览' }, slug: 'getting-started/overview' },
      { label: 'Install', translations: { 'zh-CN': '安装' }, slug: 'getting-started/install' },
      { label: 'Quickstart', translations: { 'zh-CN': '快速开始' }, slug: 'getting-started/quickstart' },
      { label: 'Connect a model', translations: { 'zh-CN': '连接模型' }, slug: 'getting-started/first-provider' },
    ],
  },
  {
    label: 'Concepts',
    translations: { 'zh-CN': '心智模型' },
    items: [
      { label: 'How it works', translations: { 'zh-CN': '工作原理' }, slug: 'concepts/how-it-works' },
      { label: 'Modes', translations: { 'zh-CN': '工作模式' }, slug: 'guides/modes' },
      { label: 'Permissions', translations: { 'zh-CN': '权限与安全' }, slug: 'guides/permissions' },
      { label: 'Data & privacy', translations: { 'zh-CN': '数据与隐私' }, slug: 'concepts/data-and-privacy' },
      { label: 'Workspace & sessions', translations: { 'zh-CN': '工作区与会话' }, slug: 'guides/workspace-session' },
    ],
  },
  {
    label: 'Surfaces',
    translations: { 'zh-CN': '入口' },
    items: [
      { label: 'Web workbench', translations: { 'zh-CN': 'Web 工作台' }, slug: 'surfaces/web-workbench' },
      { label: 'Terminal UI', translations: { 'zh-CN': '终端界面' }, slug: 'surfaces/terminal-tui' },
    ],
  },
  {
    label: 'Workflows',
    translations: { 'zh-CN': '工作流' },
    items: [
      { label: 'Explore a codebase', translations: { 'zh-CN': '探索代码库' }, slug: 'workflows/explore-codebase' },
      { label: 'Plan a change', translations: { 'zh-CN': '规划一次改动' }, slug: 'workflows/plan-a-change' },
      { label: 'Implement and verify', translations: { 'zh-CN': '实现并验证' }, slug: 'workflows/implement-and-verify' },
      { label: 'Debug a failure', translations: { 'zh-CN': '排查失败' }, slug: 'workflows/debug-a-failure' },
    ],
  },
  {
    label: 'Customize',
    translations: { 'zh-CN': '定制' },
    items: [
      { label: 'Choose a mechanism', translations: { 'zh-CN': '如何选择扩展方式' }, slug: 'customize/chooser' },
      { label: 'Rules & skills', translations: { 'zh-CN': '规则与 Skills' }, slug: 'guides/rules-skills' },
      { label: 'MCP tools', translations: { 'zh-CN': 'MCP 工具' }, slug: 'guides/mcp' },
      { label: 'Feature packs', translations: { 'zh-CN': '扩展 Pack' }, slug: 'guides/packs' },
      { label: 'Providers & models', translations: { 'zh-CN': '模型与 Provider' }, slug: 'customize/providers-models' },
    ],
  },
  {
    label: 'Reference',
    translations: { 'zh-CN': '参考' },
    items: [
      { label: 'CLI', translations: { 'zh-CN': '命令行' }, slug: 'reference/cli' },
      { label: 'Config', translations: { 'zh-CN': '配置' }, slug: 'reference/config' },
      { label: 'Shortcuts', translations: { 'zh-CN': '快捷键' }, slug: 'reference/shortcuts' },
      { label: 'Changelog', translations: { 'zh-CN': '更新日志' }, slug: 'reference/changelog' },
    ],
  },
  {
    label: 'Trust & open source',
    translations: { 'zh-CN': '信任与开源' },
    items: [
      { label: 'Security', translations: { 'zh-CN': '安全' }, slug: 'trust/security' },
      { label: 'What is open source', translations: { 'zh-CN': '开源范围与承诺' }, slug: 'open-core/what-is-open' },
      { label: 'Open Kernel', translations: { 'zh-CN': '开源 Kernel' }, slug: 'project/contributing' },
    ],
  },
  {
    label: 'Troubleshooting',
    translations: { 'zh-CN': '排障' },
    items: [
      { label: 'Common issues', translations: { 'zh-CN': '常见问题' }, slug: 'guides/troubleshooting' },
    ],
  },
];

export default defineConfig({
  site: 'https://raysolid.github.io',
  base: '/ciro-code/docs',
  trailingSlash: 'always',
  // destinations must include `base` — Astro does not prefix redirect targets
  redirects: {
    '/': '/ciro-code/docs/en/getting-started/overview/',
    '/en/': '/ciro-code/docs/en/getting-started/overview/',
    '/zh-cn/': '/ciro-code/docs/zh-cn/getting-started/overview/',
  },
  markdown: {
    rehypePlugins: [rehypeBaseLocaleLinks],
  },
  integrations: [
    starlight({
      title: 'Ciro Code',
      description: 'Local coding agent with a Web workbench',
      defaultLocale: 'en',
      locales: {
        en: {
          label: 'English',
          lang: 'en',
        },
        'zh-cn': {
          label: '简体中文',
          lang: 'zh-CN',
        },
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/Raysolid/ciro-code' },
      ],
      sidebar,
      editLink: {
        baseUrl: 'https://github.com/Raysolid/ciro-code/edit/main/docs/',
      },
      customCss: ['./src/styles/custom.css'],
      components: {
        Head: './src/components/Head.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
        LanguageSelect: './src/components/LanguageSelect.astro',
        SiteTitle: './src/components/SiteTitle.astro',
      },
    }),
  ],
});
