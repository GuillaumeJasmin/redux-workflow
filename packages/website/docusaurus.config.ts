import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Redux Workflow',
  tagline: 'One Redux API for queries, mutations, and async workflows.',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://redux-workflow.dev',
  baseUrl: '/',

  organizationName: 'guillaumejasmin',
  projectName: 'redux-workflow',

  onBrokenLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          editUrl: 'https://github.com/guillaumejasmin/redux-workflow/tree/main/packages/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Redux Workflow',
      logo: {
        alt: 'Redux Workflow',
        src: 'img/redux-workflow-logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/guillaumejasmin/redux-workflow',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting started', to: '/docs/' },
            { label: 'Queries', to: '/docs/queries' },
            { label: 'Mutations', to: '/docs/mutations' },
            { label: 'Workflows', to: '/docs/workflows' },
            { label: 'Testing', to: '/docs/testing' },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/guillaumejasmin/redux-workflow',
            },
            {
              label: 'npm — core',
              href: 'https://www.npmjs.com/package/@redux-workflow/core',
            },
            {
              label: 'npm — react',
              href: 'https://www.npmjs.com/package/@redux-workflow/react',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Redux Workflow contributors. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'tsx'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
