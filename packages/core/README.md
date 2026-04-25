# @redux-workflow/core

Framework-agnostic core for [redux-workflow] — one Redux API for queries,
mutations, and async workflows. Built on top of
[Redux Toolkit](https://redux-toolkit.js.org) and
[Redux Saga](https://redux-saga.js.org/).

> Using React? Install [`@redux-workflow/react`](https://www.npmjs.com/package/@redux-workflow/react)
> instead — it re-exports everything from this package and adds hooks.

## Install

```bash
pnpm add @redux-workflow/core @reduxjs/toolkit redux-saga
```

`@reduxjs/toolkit` and `redux-saga` are peer dependencies.

## Quickstart

```ts
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { createApi } from '@redux-workflow/core';

const usersApi = createApi({
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

const sagaMiddleware = createSagaMiddleware();
const store = configureStore({
  reducer: combineReducers({ [usersApi.reducerPath]: usersApi.reducer }),
  middleware: (getDefault) => getDefault().concat(sagaMiddleware),
});
sagaMiddleware.run(usersApi.rootSaga);
```

## Documentation

Full docs at **[redux-workflow.dev](https://redux-workflow.dev)**.

## License

MIT © Guillaume Jasmin

[redux-workflow]: https://github.com/GuillaumeJasmin/redux-workflow
