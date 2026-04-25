import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts', testing: 'src/testing/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: ['react', 'react-redux', '@reduxjs/toolkit', 'redux-saga', 'vitest'],
  },
  target: false,
});
