export const en = {
  locale: 'en' as const,
  lang: 'en',
  otherLocale: 'zh-cn' as const,
  otherLocaleLabel: '简体中文',
  otherLocaleHref: '/ciro-code/zh-cn/',
  docsHref: '/ciro-code/docs/en/',
  docsOverviewHref: '/ciro-code/docs/en/getting-started/overview/',
  docsQuickstartHref: '/ciro-code/docs/en/getting-started/quickstart/',
  docsInstallHref: '/ciro-code/docs/en/getting-started/install/',
  llmsHref: '/ciro-code/docs/llms.txt',
  nav: {
    docs: 'Docs',
    github: 'GitHub',
    lang: 'Language',
  },
  hero: {
    title: 'Ciro Code',
    tagline:
      'A local-first coding agent. Open a Web workbench on your machine, work in your project, keep data on disk.',
    ctaDocs: 'Read the docs',
    ctaGithub: 'GitHub',
    copyLabel: 'Copy',
    copiedLabel: 'Copied',
    commentInstall: '# Install CLI',
    commentStart: '# Start local workbench',
  },
  product: {
    title: 'Local Web workbench',
    caption: 'Runs on your machine · http://127.0.0.1:3080',
  },
  capabilities: {
    title: 'What you get',
    items: [
      {
        title: 'Four modes',
        body: 'Ask, Plan, Agent, and Debug — clear roles and permission boundaries for each step.',
      },
      {
        title: 'Rules, Skills & MCP',
        body: 'Shape agent behavior with project rules and skills; connect MCP tools when you need them.',
      },
      {
        title: 'Feature Packs',
        body: 'Extend capabilities from npm with `ciro pack add` — keep the Kernel auditable.',
      },
    ],
  },
  openCore: {
    title: 'Open Core boundary',
    p1: 'The Kernel and CLI are fully open source—you can audit all local execution logic.',
    p2: 'The Web UI and official Profile ship as npm install artifacts; their source is not open, so we can sustain development and a commercial loop.',
    p3: 'We commit that your local data stays on your machine and is never uploaded without your permission.',
    link: 'Learn more in the docs',
  },
  quickstart: {
    title: 'Quickstart',
    steps: [
      { label: 'Install', detail: 'npm install -g @ciro-code/code' },
      { label: 'Start', detail: 'ciro web' },
      { label: 'Connect a model', detail: 'Settings → Provider, or set an API key env var' },
      { label: 'Pick a workspace', detail: 'Open your project folder and start a session' },
    ],
    more: 'Full Quickstart walkthrough',
  },
  faq: {
    title: 'FAQ',
    items: [
      {
        q: 'How is this different from Ciro Chat?',
        a: 'Ciro Code is a local coding agent with a Web workbench on your machine. Ciro Chat is the cloud chat product. They share branding, not a runtime.',
      },
      {
        q: 'Does it work on Windows?',
        a: 'Yes. Prefer pwsh. See the Install and Troubleshooting docs for PATH, port 3080, and ExecutionPolicy notes.',
      },
      {
        q: 'Does it modify my code?',
        a: 'In Agent mode it can propose and apply edits under your permission policy. Ask and Plan modes stay read-oriented.',
      },
      {
        q: 'Where are API keys stored?',
        a: 'On your machine (local config). They are not uploaded without your permission. See SECURITY.md in the repository.',
      },
      {
        q: 'What is open source?',
        a: 'Kernel and CLI are open and auditable. Web UI and official Profiles ship as npm install artifacts. Local data stays local.',
      },
    ],
  },
  footer: {
    blurb: 'Open Core. Data stays on your machine.',
    license: 'MIT',
    npm: 'npm',
    llms: 'llms.txt',
    docs: 'Docs',
  },
};

export type Messages = typeof en;
