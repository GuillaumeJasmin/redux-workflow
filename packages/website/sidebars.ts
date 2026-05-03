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
      items: ['queries', 'mutations', 'workflows', 'api-slice'],
    },
    {
      type: 'category',
      label: 'React hooks',
      collapsed: false,
      link: { type: 'doc', id: 'hooks/index' },
      items: ['hooks/useQuery', 'hooks/useLazyQuery', 'hooks/useMutation', 'hooks/useWorkflow'],
    },
    {
      type: 'category',
      label: 'Testing',
      link: { type: 'doc', id: 'testing/index' },
      items: [
        'testing/assertions',
        'testing/dispatched-actions',
        'testing/mocking-dependent-apis',
        'testing/advanced',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: ['architecture', 'rtk-query-comparison'],
    },
    'recipes',
    {
      type: 'category',
      label: 'Maintainers',
      items: ['publishing'],
    },
  ],
};

export default sidebars;
