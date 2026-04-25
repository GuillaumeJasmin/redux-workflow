import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'configs/recommended': 'src/configs/recommended.ts',
  },
  format: ['cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: ['eslint'],
  },
  target: false,
});
