import { defineConfig } from 'vitepress'

// GitHub project pages serve the repo under /Munchkin-CLI/; this site is the
// /docs/ section of the deployed dist-docs artifact (landing page = site root,
// generated plugin docs = /plugins/).
export default defineConfig({
  base: '/Munchkin-CLI/docs/',
  // build outside src/ so biome/lint sweeps of src/ never see generated assets
  outDir: '../build',
  lang: 'en-US',
  title: 'forge',
  titleTemplate: false,
  description:
    'A from-scratch, fully customizable, open-source CLI coding agent — event-sourced sessions, permission-first tooling, provider-agnostic models, plugin everything.',
  head: [
    [
      'link',
      {
        rel: 'icon',
        href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%230d1117'/><text x='50' y='72' font-size='62' font-family='monospace' fill='%2379c0ff' text-anchor='middle'>f</text></svg>",
      },
    ],
  ],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Features', link: '/guide/features' },
      {
        text: 'Reference',
        items: [
          { text: 'HTTP API', link: '/reference/api' },
          { text: 'CLI', link: '/reference/cli' },
        ],
      },
      { text: 'GitHub', link: 'https://github.com/inbesat/Munchkin-CLI' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Configuration', link: '/guide/configuration' },
          { text: 'Features', link: '/guide/features' },
          { text: 'Plugins', link: '/guide/plugins' },
          { text: 'Architecture', link: '/guide/architecture' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'HTTP API', link: '/reference/api' },
          { text: 'CLI', link: '/reference/cli' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/inbesat/Munchkin-CLI' }],
    editLink: {
      pattern: 'https://github.com/inbesat/Munchkin-CLI/edit/main/packages/docs/src/:path',
      text: 'Edit this page on GitHub',
    },
    outline: 'deep',
  },
})
