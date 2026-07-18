import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: 'vue-error-boundary-kit/adapters/console',
        replacement: fileURLToPath(new URL('../src/adapters/console.ts', import.meta.url)),
      },
      {
        find: 'vue-error-boundary-kit/adapters/http',
        replacement: fileURLToPath(new URL('../src/adapters/http.ts', import.meta.url)),
      },
      {
        find: 'vue-error-boundary-kit/adapters/sentry',
        replacement: fileURLToPath(new URL('../src/adapters/sentry.ts', import.meta.url)),
      },
      {
        find: 'vue-error-boundary-kit/adapters/bugsnag',
        replacement: fileURLToPath(new URL('../src/adapters/bugsnag.ts', import.meta.url)),
      },
      {
        find: 'vue-error-boundary-kit/adapters/logrocket',
        replacement: fileURLToPath(new URL('../src/adapters/logrocket.ts', import.meta.url)),
      },
      {
        find: 'vue-error-boundary-kit/adapters/rate-limit',
        replacement: fileURLToPath(new URL('../src/adapters/rateLimit.ts', import.meta.url)),
      },
      {
        find: 'vue-error-boundary-kit/devtools',
        replacement: fileURLToPath(new URL('../src/devtools.ts', import.meta.url)),
      },
      {
        find: 'vue-error-boundary-kit/global-capture',
        replacement: fileURLToPath(new URL('../src/useGlobalErrorCapture.ts', import.meta.url)),
      },
      {
        find: 'vue-error-boundary-kit',
        replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)),
      },
    ],
  },
})
