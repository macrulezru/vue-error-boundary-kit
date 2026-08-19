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
        index: resolve(import.meta.dirname, 'src/index.ts'),
        asyncBoundary: resolve(import.meta.dirname, 'src/asyncBoundary.ts'),
        testing: resolve(import.meta.dirname, 'src/testing.ts'),
        retryWithBackoff: resolve(import.meta.dirname, 'src/retryWithBackoff.ts'),
        useGlobalErrorCapture: resolve(import.meta.dirname, 'src/useGlobalErrorCapture.ts'),
        devtools: resolve(import.meta.dirname, 'src/devtools.ts'),
        'adapters/console': resolve(import.meta.dirname, 'src/adapters/console.ts'),
        'adapters/http': resolve(import.meta.dirname, 'src/adapters/http.ts'),
        'adapters/sentry': resolve(import.meta.dirname, 'src/adapters/sentry.ts'),
        'adapters/bugsnag': resolve(import.meta.dirname, 'src/adapters/bugsnag.ts'),
        'adapters/logrocket': resolve(import.meta.dirname, 'src/adapters/logrocket.ts'),
        'adapters/rateLimit': resolve(import.meta.dirname, 'src/adapters/rateLimit.ts'),
        'adapters/otel': resolve(import.meta.dirname, 'src/adapters/otel.ts'),
        'adapters/breadcrumbs': resolve(import.meta.dirname, 'src/adapters/breadcrumbs.ts'),
        'nuxt/module': resolve(import.meta.dirname, 'src/nuxt/module.ts'),
        'nuxt/runtime': resolve(import.meta.dirname, 'src/nuxt/runtime.ts'),
        'integrations/tanstackQuery': resolve(import.meta.dirname, 'src/integrations/tanstackQuery.ts'),
        router: resolve(import.meta.dirname, 'src/router.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => (format === 'es' ? `${entryName}.mjs` : `${entryName}.cjs`),
    },
    rollupOptions: {
      // @nuxt/kit is Node-only, used by src/nuxt/module.ts (executed by the Nuxt CLI at
      // build/config time, which always has it available transitively via `nuxt` itself).
      // nuxt/app is the runtime composables entry used by src/nuxt/runtime.ts, resolvable only
      // inside a real Nuxt app build. @tanstack/vue-query is an optional peer used only by
      // src/integrations/tanstackQuery.ts. vue-router is an optional peer used only by
      // src/router.ts. None of these should ever be bundled into our output.
      external: ['vue', '@nuxt/kit', 'nuxt/app', '@tanstack/vue-query', 'vue-router'],
      output: {
        globals: { vue: 'Vue' },
        exports: 'named',
      },
    },
    minify: true,
    target: 'es2020',
  },
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
})
