import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

/** @type {import('@astrojs/starlight/types').StarlightUserConfig['sidebar']} */
const sidebar = [
  {
    label: 'Getting started',
    translations: { 'zh-CN': '入门' },
    items: [
      { label: 'Overview', translations: { 'zh-CN': '概览' }, slug: 'getting-started/overview' },
      { label: 'Install', translations: { 'zh-CN': '安装' }, slug: 'getting-started/install' },
      { label: 'Quickstart', translations: { 'zh-CN': '快速开始' }, slug: 'getting-started/quickstart' },
      { label: 'First provider', translations: { 'zh-CN': '配置模型' }, slug: 'getting-started/first-provider' },
    ],
  },
  {
    label: 'Guides',
    translations: { 'zh-CN': '指南' },
    items: [
      { label: 'Modes', translations: { 'zh-CN': '模式' }, slug: 'guides/modes' },
      { label: 'Workspace & sessions', translations: { 'zh-CN': '工作区与会话' }, slug: 'guides/workspace-session' },
      { label: 'Rules & skills', translations: { 'zh-CN': 'Rules 与 Skills' }, slug: 'guides/rules-skills' },
      { label: 'MCP', translations: { 'zh-CN': 'MCP' }, slug: 'guides/mcp' },
      { label: 'Packs', translations: { 'zh-CN': 'Feature Packs' }, slug: 'guides/packs' },
      { label: 'Permissions', translations: { 'zh-CN': '权限' }, slug: 'guides/permissions' },
      { label: 'Troubleshooting', translations: { 'zh-CN': '排障' }, slug: 'guides/troubleshooting' },
    ],
  },
  {
    label: 'Reference',
    translations: { 'zh-CN': '参考' },
    items: [
      { label: 'CLI', translations: { 'zh-CN': 'CLI' }, slug: 'reference/cli' },
      { label: 'Config', translations: { 'zh-CN': '配置' }, slug: 'reference/config' },
      { label: 'Changelog', translations: { 'zh-CN': '更新日志' }, slug: 'reference/changelog' },
    ],
  },
  {
    label: 'Project',
    translations: { 'zh-CN': '项目' },
    items: [
      { label: 'Contributing', translations: { 'zh-CN': '贡献' }, slug: 'project/contributing' },
    ],
  },
];

export default defineConfig({
  site: 'https://raysolid.github.io',
  base: '/ciro-code/docs',
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
    }),
  ],
});
