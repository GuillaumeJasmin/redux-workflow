import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Introduction',
      collapsed: false,
      items: ['getting-started', 'cheat-sheet'],
    },
    {
      type: 'category',
      label: 'Core concepts',
      collapsed: false,
      items: ['queries', 'mutations', 'workflows'],
    },
    'hooks',
    {
      type: 'category',
      label: 'Guides',
      items: ['architecture', 'testing', 'rtk-query-comparison'],
    },
    {
      type: 'category',
      label: 'Maintainers',
      items: ['publishing'],
    },
  ],
};

export default sidebars;
