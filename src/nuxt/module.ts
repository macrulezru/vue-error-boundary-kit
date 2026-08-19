import { addComponent, addImports, defineNuxtModule, useLogger } from '@nuxt/kit'
import type { ModuleOptions } from './types'

export type { ModuleOptions }

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'vue-error-boundary-kit',
    configKey: 'errorBoundaryKit',
    // Verified against @nuxt/kit 4.5.2, whose NuxtMajorVersion type explicitly spans 2/3/4;
    // Nuxt 3 itself wasn't separately re-tested, so treat that half of the range as reasoned,
    // not independently confirmed the way 4.x was.
    compatibility: { nuxt: '>=3.0.0' },
  },
  defaults: {
    component: true,
    autoImports: true,
  },
  setup(options, nuxt) {
    const logger = useLogger('vue-error-boundary-kit')

    // Nuxt's own auto-reference machinery (@nuxt/kit's writeTypes) only ever references this
    // package's root `types` entry (dist/index.d.ts) — it resolves `modules: [...]` entries back
    // to their nearest package.json, which is the package root regardless of which subpath was
    // actually imported. That entry never touches src/nuxt/types.ts, so the `declare module
    // '@nuxt/schema'` augmentation adding `errorBoundaryKit` to NuxtConfig/NuxtOptions would
    // silently never reach a consumer's nuxt.config.ts typing without this explicit reference.
    nuxt.hook('prepare:types', ({ references }) => {
      references.push({ types: 'vue-error-boundary-kit/nuxt' })
    })

    if (options.component) {
      addComponent({
        name: 'ErrorBoundary',
        filePath: 'vue-error-boundary-kit',
        export: 'ErrorBoundary',
      })
    }

    if (options.autoImports) {
      addImports([
        { name: 'useErrorBoundary', from: 'vue-error-boundary-kit' },
        { name: 'useGlobalErrorCapture', from: 'vue-error-boundary-kit/global-capture' },
        { name: 'useNuxtErrorBoundary', from: 'vue-error-boundary-kit/nuxt/runtime' },
      ])
    }

    logger.debug('registered', {
      component: options.component,
      autoImports: options.autoImports,
    })
  },
})
