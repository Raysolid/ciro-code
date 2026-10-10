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
      { label: 'Quickstart', translations: { 'zh-CN': '快速开始' }, slug: 'getting-started/quickstart' },
      { label: 'Install', translations: { 'zh-CN': '安装' }, slug: 'getting-started/install' },
      { label: 'Connect a model', translations: { 'zh-CN': '连接模型' }, slug: 'getting-started/first-provider' },
    ],
  },
  {
    label: 'Using Ciro',
    translations: { 'zh-CN': '使用指南' },
    items: [
      { label: 'Modes', translations: { 'zh-CN': '工作模式' }, slug: 'guides/modes' },
      { label: 'Workspace & sessions', translations: { 'zh-CN': '工作区与会话' }, slug: 'guides/workspace-session' },
      { label: 'Rules & skills', translations: { 'zh-CN': '规则与 Skills' }, slug: 'guides/rules-skills' },
      { label: 'MCP tools', translations: { 'zh-CN': 'MCP 工具' }, slug: 'guides/mcp' },
      { label: 'Feature packs', translations: { 'zh-CN': '扩展 Pack' }, slug: 'guides/packs' },
      { label: 'Permissions', translations: { 'zh-CN': '权限与安全' }, slug: 'guides/permissions' },
      { label: 'Troubleshooting', translations: { 'zh-CN': '常见问题' }, slug: 'guides/troubleshooting' },
    ],
  },
  {
    label: 'Reference',
    translations: { 'zh-CN': '参考' },
    items: [
      { label: 'CLI', translations: { 'zh-CN': '命令行' }, slug: 'reference/cli' },
      { label: 'Config', translations: { 'zh-CN': '配置' }, slug: 'reference/config' },
      { label: 'Changelog', translations: { 'zh-CN': '更新日志' }, slug: 'reference/changelog' },
    ],
  },
  {
    label: 'Contribute',
    translations: { 'zh-CN': '参与贡献' },
    items: [
      { label: 'Build from source', translations: { 'zh-CN': '从源码构建' }, slug: 'project/contributing' },
    ],
  },
];

export default defineConfig({
  site: 'https://raysolid.github.io',
  base: '/ciro-code/docs',
  trailingSlash: 'always',
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
        Hero: './src/components/Hero.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
        LanguageSelect: './src/components/LanguageSelect.astro',
        SiteTitle: './src/components/SiteTitle.astro',
      },
    }),
  ],
});
