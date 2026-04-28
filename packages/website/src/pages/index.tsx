import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import clsx from 'clsx';

import styles from './index.module.css';

const FEATURES = [
  {
    icon: '🔍',
    title: 'Queries',
    description:
      'Cached, deduped, and refetch-on-focus reads. Subscribe from a component and the cache handles deduplication, staleTime, polling, and garbage collection for you.',
  },
  {
    icon: '✏️',
    title: 'Mutations',
    description:
      'Writes that invalidate the cache by query name. First-class optimistic updates with rollback via onStart / onError.',
  },
  {
    icon: '🪢',
    title: 'Workflows',
    description:
      'Saga-powered orchestration: listen to actions, compose queries and mutations, open long-lived connections, cancel cleanly on unmount or domain events.',
  },
];

const SAMPLE_QUERY = `import { createApi, httpRequest } from '@redux-workflow/core';
import { useQuery } from '@redux-workflow/react';

type User = { id: string; name: string };

const api = createApi({
  name: 'users',
  queries: (query) => ({
    getUser: query({
      execute: httpRequest<User, { id: string }>({
        baseUrl: 'https://api.example.com',
        url: ({ id }) => \`/users/\${id}\`,
      }),
      cache: 60,             // fresh for 60 seconds
      refetchOnFocus: true,  // refresh when the tab regains focus
    }),
  }),
});

function UserCard({ id }: { id: string }) {
  const { data, isLoading, refetch } = useQuery(api.queries.getUser, { id });
  if (isLoading) return <Spinner />;
  return <button onClick={refetch}>{data.name}</button>;
}`;

const SAMPLE_MUTATION = `import { createApi, httpRequest } from '@redux-workflow/core';
import { useMutation } from '@redux-workflow/react';

type User = { id: string; name: string };

const api = createApi({
  name: 'users',
  // ...queries above (getUser)
  mutations: (mutation) => ({
    renameUser: mutation({
      execute: httpRequest<User, { id: string; name: string }>({
        baseUrl: 'https://api.example.com',
        url: ({ id }) => \`/users/\${id}\`,
        method: 'PATCH',
        body: ({ name }) => ({ name }),
      }),
      // Invalidate every cached \`getUser\` entry — they refetch automatically.
      invalidates: ['getUser'],
    }),
  }),
});

function RenameButton({ id }: { id: string }) {
  const [rename, { isLoading }] = useMutation(api.mutations.renameUser);
  return (
    <button onClick={() => rename({ id, name: 'New name' })} disabled={isLoading}>
      Rename
    </button>
  );
}`;

const SAMPLE_WORKFLOW = `import { createApi, race, delay, cancelled } from '@redux-workflow/core';
import { useWorkflow } from '@redux-workflow/react';

const api = createApi({
  name: 'orders',
  // ...queries / mutations above (getOrder, confirmOrder, releaseHold)
  workflows: (workflow) => ({
    checkoutOrder: workflow({
      *execute({ orderId }: { orderId: string }, { query, mutate, put }) {
        try {
          // Race the order fetch against a 5-second timeout.
          const result = yield* race({
            order: query('getOrder', { orderId }),
            timeout: delay(5_000),
          });
          if ('timeout' in result) return { error: 'TIMEOUT' };
          if ('error' in result.order) return { error: result.order.error };

          const confirmed = yield* mutate('confirmOrder', { orderId });
          yield* put(orderConfirmed({ orderId }));
          return confirmed;
        } finally {
          // User navigated away mid-checkout → release the cart hold.
          if (yield* cancelled()) {
            yield* mutate('releaseHold', { orderId });
          }
        }
      },
    }),
  }),
});

function CheckoutButton({ orderId }: { orderId: string }) {
  const [checkout, { isLoading }] = useWorkflow(api.workflows.checkoutOrder, {
    cancelOnUnmount: true, // unmount → finally block runs
  });
  return (
    <button onClick={() => checkout({ orderId })} disabled={isLoading}>
      Place order
    </button>
  );
}`;

export default function Home(): React.ReactElement {
  const { siteConfig } = useDocusaurusContext();

  return (
    <Layout title="Home" description={siteConfig.tagline}>
      <header className={styles.hero}>
        <img src="img/redux-workflow-banner.png" alt="Redux Workflow" className={styles.heroLogo} />
        <h1 className={styles.heroTitle}>
          One Redux API for queries, mutations, and async workflows.
        </h1>
        <p className={styles.heroSubtitle}>
          Built on top of <a href="https://redux-toolkit.js.org">Redux Toolkit</a> and{' '}
          <a href="https://redux-saga.js.org/">Redux Saga</a>. Cached reads, invalidating writes,
          and saga-powered orchestration — behind a single typed surface.
        </p>
        <div className={styles.heroButtons}>
          <Link className="button button--primary button--lg" to="/docs/">
            Get started
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="https://github.com/guillaumejasmin/redux-workflow"
          >
            GitHub
          </Link>
        </div>
      </header>

      <section className={styles.features}>
        <div className={styles.featuresInner}>
          {FEATURES.map(({ icon, title, description }) => (
            <div key={title} className={styles.feature}>
              <div className={styles.featureIcon} aria-hidden>
                {icon}
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.codeSection}>
        <div className={styles.codeSectionInner}>
          <h2 className={styles.codeSectionTitle}>One API, three concepts</h2>
          <p className={styles.codeSectionLead}>
            Cached reads, invalidating writes, and saga-powered orchestration — in the same typed
            api.
          </p>
          <Tabs groupId="concept">
            <TabItem value="query" label="Query" default>
              <CodeBlock language="tsx">{SAMPLE_QUERY}</CodeBlock>
            </TabItem>
            <TabItem value="mutation" label="Mutation">
              <CodeBlock language="tsx">{SAMPLE_MUTATION}</CodeBlock>
            </TabItem>
            <TabItem value="workflow" label="Workflow">
              <CodeBlock language="tsx">{SAMPLE_WORKFLOW}</CodeBlock>
            </TabItem>
          </Tabs>
        </div>
      </section>

      <section className={clsx(styles.features, styles.codeSection)} style={{ borderTop: 'none' }}>
        <div className={styles.codeSectionInner} style={{ textAlign: 'center' }}>
          <h2 className={styles.codeSectionTitle}>Ready to dig in?</h2>
          <p className={styles.codeSectionLead}>
            The docs walk through every option, from caching strategies to saga workflows and
            testing.
          </p>
          <Link className="button button--primary button--lg" to="/docs/">
            Read the docs
          </Link>
        </div>
      </section>
    </Layout>
  );
}
