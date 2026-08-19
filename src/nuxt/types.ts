export interface ModuleOptions {
  /** Auto-register `<ErrorBoundary>` as a global component. Default: true. */
  component?: boolean
  /**
   * Auto-import `useErrorBoundary`, `useGlobalErrorCapture`, and `useNuxtErrorBoundary`
   * (from `vue-error-boundary-kit/nuxt/runtime`). Default: true.
   */
  autoImports?: boolean
}

declare module '@nuxt/schema' {
  interface NuxtConfig {
    errorBoundaryKit?: ModuleOptions
  }
  interface NuxtOptions {
    errorBoundaryKit: ModuleOptions
  }
}
