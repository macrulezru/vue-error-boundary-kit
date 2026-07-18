import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    dts({
      insertTypesEntry: true,
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['src/**/__tests__/**'],
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        useGlobalErrorCapture: resolve(__dirname, 'src/useGlobalErrorCapture.ts'),
        devtools: resolve(__dirname, 'src/devtools.ts'),
        'adapters/console': resolve(__dirname, 'src/adapters/console.ts'),
        'adapters/http': resolve(__dirname, 'src/adapters/http.ts'),
        'adapters/sentry': resolve(__dirname, 'src/adapters/sentry.ts'),
        'adapters/bugsnag': resolve(__dirname, 'src/adapters/bugsnag.ts'),
        'adapters/logrocket': resolve(__dirname, 'src/adapters/logrocket.ts'),
        'adapters/rateLimit': resolve(__dirname, 'src/adapters/rateLimit.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => (format === 'es' ? `${entryName}.mjs` : `${entryName}.cjs`),
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: { vue: 'Vue' },
        exports: 'named',
      },
    },
    minify: 'esbuild',
    target: 'es2020',
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
})
