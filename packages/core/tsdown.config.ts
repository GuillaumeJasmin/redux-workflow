import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    testing: 'src/testing/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: ['@reduxjs/toolkit', 'redux-saga', 'typed-redux-saga', 'vitest'],
  },
  target: false,
});
