---
title: Hooks reference
---

# Hooks reference

The four hooks live in `@redux-workflow/react`.

## `useQuery(instance, args, options?)`

| Return field | Type              |
| ------------ | ----------------- |
| `data`       | `TResult \| null` |
| `isLoading`  | `boolean`         |
| `isSuccess`  | `boolean`         |
| `isError`    | `boolean`         |
| `error`      | `string \| null`  |
| `refetch`    | `() => void`      |

Options: `{ skip?: boolean }`.

## `useLazyQuery(instance)`

Returns `[trigger, result]`.

```ts
const [trigger, { data, isLoading, isSuccess, isError, error, isUntriggered }] =
  useLazyQuery(instance);

trigger(args);
```

## `useMutation(instance)`

Returns `[trigger, result]`.

```ts
const [trigger, { data, isLoading, isSuccess, isError, error, reset }] = useMutation(instance);

trigger(args);
reset(); // clears the mutation state
```

## `useWorkflow(instance, options?)`

Returns `[trigger, result]`.

```ts
const [trigger, { data, isLoading, isSuccess, isError, error, reset }] = useWorkflow(instance, {
  cancelOnUnmount: true,
});

trigger(args);
```
