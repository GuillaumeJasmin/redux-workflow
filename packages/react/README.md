# @redux-workflow/react

React bindings for [redux-workflow] — one Redux API for queries, mutations,
and async workflows. Built on top of
[Redux Toolkit](https://redux-toolkit.js.org) and
[Redux Saga](https://redux-saga.js.org/).

This package re-exports everything from `@redux-workflow/core` and adds the
hooks: `useQuery`, `useLazyQuery`, `useMutation`, `useWorkflow`.

## Install

```bash
pnpm add @redux-workflow/react @reduxjs/toolkit redux-saga
```

`react`, `react-redux`, `@reduxjs/toolkit`, and `redux-saga` are peer
dependencies — install them only if your project doesn't already have them.

## Quickstart

```ts
import { createApi } from '@redux-workflow/react';

export const usersApi = createApi({
  name: 'usersApi',
  queries: (query) => ({
    getUser: query({
      async execute({ id }: { id: string }) {
        const res = await fetch(`/users/${id}`);
        return { data: await res.json() };
      },
      cache: 60,
    }),
  }),
});
```

```tsx
import { useQuery } from '@redux-workflow/react';
import { usersApi } from './usersApi';

function UserCard({ id }: { id: string }) {
  const { data, isLoading } = useQuery(usersApi.queries.getUser, { id });
  if (isLoading) return <Spinner />;
  return <div>{data.name}</div>;
}
```

See the [root README] for store setup.

## Documentation

Full docs at **[redux-workflow.dev](https://redux-workflow.dev)**.

## License

MIT © Guillaume Jasmin

[redux-workflow]: https://github.com/GuillaumeJasmin/redux-workflow
[root README]: https://github.com/GuillaumeJasmin/redux-workflow#quickstart
