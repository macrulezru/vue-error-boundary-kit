<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  ErrorBoundary,
  useErrorBoundary,
  type CapturedError,
  type ErrorReporter,
} from 'vue-error-boundary-kit'
import { useGlobalErrorCapture } from 'vue-error-boundary-kit/global-capture'
import { createConsoleReporter } from 'vue-error-boundary-kit/adapters/console'
import { createRateLimitedReporter } from 'vue-error-boundary-kit/adapters/rate-limit'
import { createErrorHistory, ErrorHistoryPanel } from 'vue-error-boundary-kit/devtools'
import Crasher from './Crasher.vue'
import AsyncCrasher from './AsyncCrasher.vue'

// --- 1. basic boundary -----------------------------------------------------
const crash1 = ref(true)
// Crasher only checks `crash` once, inside its own setup() — changing the prop on an
// already-mounted instance does nothing (Vue doesn't re-run setup() on prop updates). Forcing
// a fresh mount via :key is what actually makes "break it again" throw again.
const attempt1 = ref(0)

function breakItAgain() {
  crash1.value = true
  attempt1.value++
}

// --- 2. resetKeys ------------------------------------------------------------
const routeId = ref('profile-1')
const crash2 = ref(true)
// Same remount-via-:key story as section 1 — needed to re-arm the demo for a repeat.
const attempt2 = ref(0)

// --- 3. maxRetries -----------------------------------------------------------
const crash3 = ref(true)

// --- 4. nested boundaries / isolate -------------------------------------------
// Starts true (crashing) with isolate4 defaulting to true too, so the FIRST thing you see is
// the package default: the inner boundary absorbs the error locally, the outer never notices.
// Uncheck the box and "break it again" to see it bubble instead.
const crash4 = ref(true)
const isolate4 = ref(true)
const outerEvents = ref<string[]>([])
// Crasher only checks `crash` once, inside its own setup() — same remount-via-:key trick as
// section 1 is needed to make repeated "break it again" clicks actually throw again.
const attempt4 = ref(0)
// Once a boundary takes over, its own fallback replaces the tree that used to contain the
// button that could reach it — reset it imperatively via a template ref instead. Calling
// reset() on a boundary that isn't in an error state is a harmless no-op, so it's safe to
// call it on both regardless of which one actually caught the error.
const outerBoundary4 = ref<InstanceType<typeof ErrorBoundary> | null>(null)
const innerBoundary4 = ref<InstanceType<typeof ErrorBoundary> | null>(null)

function fixNestedWidget() {
  crash4.value = false
  outerBoundary4.value?.reset()
  innerBoundary4.value?.reset()
}

function breakNestedWidgetAgain() {
  crash4.value = true
  attempt4.value++
}

// --- 5. useErrorBoundary() composable — manual capture ------------------------
const manual = useErrorBoundary({ onError: (e) => log(`manual: ${e.message}`) })

function triggerRawEventHandlerError() {
  // A raw DOM error, e.g. thrown inside a non-Vue callback — <ErrorBoundary> cannot see this.
  try {
    JSON.parse('{not valid json')
  } catch (err) {
    manual.captureError(err, { source: 'manual', componentName: 'DemoButton' })
  }
}

// --- 6. async setup() ----------------------------------------------------------
const crash6 = ref(true)
const remount6 = ref(0)

// --- 7. reporting adapter (console) ---------------------------------------------
const reportLog = ref<string[]>([])
function log(message: string) {
  reportLog.value = [`${new Date().toLocaleTimeString()} — ${message}`, ...reportLog.value].slice(0, 8)
}
const loggingReporter: ErrorReporter = {
  report(error: CapturedError) {
    log(`[reporter] (${error.source}) ${error.message}`)
  },
}
const consoleReporter = createConsoleReporter()
// --- 9. devtools error history — fed by every boundary above via combinedReporter ------------
const history = createErrorHistory({ limit: 20 })
const combinedReporter: ErrorReporter = {
  report(error, context) {
    loggingReporter.report(error, context)
    consoleReporter.report(error, context)
    history.record.report(error, context)
  },
}

// --- 8. useGlobalErrorCapture() --------------------------------------------------
onMounted(() => {
  useGlobalErrorCapture({
    onError: (e) => log(`[global] (${e.source}) ${e.message}`),
  })
})

function triggerUnhandledRejection() {
  Promise.reject(new Error('unhandled rejection from a detached promise'))
}

function triggerNativeListenerError() {
  const btn = document.createElement('button')
  btn.addEventListener('click', () => {
    throw new Error('thrown from a raw addEventListener callback')
  })
  btn.click()
}

// --- 10. rate-limit / dedup ------------------------------------------------------------------
const massFailureStats = reactive({ forwarded: 0, dedup: 0, rateLimit: 0 })

// A fresh reporter per demo click, each with its own clean window — a real app would create
// this once (e.g. wrapping its Sentry reporter) and let it live for the whole session, with the
// window naturally carrying state across every error the app throws.
function makeMassFailureReporter(): ErrorReporter {
  massFailureStats.forwarded = 0
  massFailureStats.dedup = 0
  massFailureStats.rateLimit = 0
  return createRateLimitedReporter(
    {
      report() {
        massFailureStats.forwarded++
      },
    },
    {
      maxPerWindow: 5,
      windowMs: 10_000,
      dedupWindowMs: 10_000,
      onSuppressed: (_error, { reason }) => {
        if (reason === 'dedup') massFailureStats.dedup++
        else massFailureStats.rateLimit++
      },
    },
  )
}

function captureDemoError(reporter: ErrorReporter, message: string): void {
  reporter.report({
    error: new Error(message),
    message,
    componentName: 'FlakyList',
    source: 'render',
    timestamp: Date.now(),
  })
}

function simulateIdenticalFailures() {
  const reporter = makeMassFailureReporter()
  for (let i = 0; i < 20; i++) captureDemoError(reporter, 'FlakyList: same failure, 20x')
}

function simulateDistinctFailures() {
  const reporter = makeMassFailureReporter()
  for (let i = 0; i < 20; i++) captureDemoError(reporter, `FlakyList: distinct failure #${i}`)
}
</script>

<template>
  <main class="page">
    <h1>vue-error-boundary-kit — demo</h1>
    <p class="lede">
      Production error boundaries for Vue 3: a declarative <code>&lt;ErrorBoundary&gt;</code>,
      the <code>useErrorBoundary()</code> composable, adapter-based reporting, and
      <code>useGlobalErrorCapture()</code> for what <code>errorCaptured</code> structurally can't see.
    </p>

    <section class="panel">
      <h2>1. Basic boundary + retry</h2>
      <ErrorBoundary :reporter="combinedReporter">
        <template #default>
          <Crasher :key="attempt1" :crash="crash1" label="UserProfile" />
        </template>
        <template #fallback="{ error, retry, retryCount }">
          <div class="fallback">
            <p>💥 {{ error.message }}</p>
            <p class="muted">retries: {{ retryCount }}</p>
            <button
              @click="
                () => {
                  crash1 = false
                  retry()
                }
              "
            >
              fix &amp; retry
            </button>
          </div>
        </template>
      </ErrorBoundary>
      <button v-if="!crash1" @click="breakItAgain">break it again</button>
    </section>

    <section class="panel">
      <h2>2. resetKeys — auto-reset on navigation</h2>
      <p class="muted">route: {{ routeId }}</p>
      <ErrorBoundary :reset-keys="[routeId]" :reporter="combinedReporter">
        <template #default>
          <Crasher :key="attempt2" :crash="crash2" :label="routeId" />
        </template>
        <template #fallback="{ error }">
          <div class="fallback">💥 {{ error.message }}</div>
        </template>
      </ErrorBoundary>
      <div class="row">
        <button
          v-if="crash2"
          @click="
            () => {
              crash2 = false
              routeId = routeId === 'profile-1' ? 'profile-2' : 'profile-1'
            }
          "
        >
          navigate (fixes &amp; changes resetKeys)
        </button>
        <button
          v-else
          @click="
            () => {
              crash2 = true
              attempt2++
            }
          "
        >
          break it again
        </button>
      </div>
    </section>

    <section class="panel">
      <h2>3. maxRetries</h2>
      <ErrorBoundary :max-retries="2" :reporter="combinedReporter">
        <template #default>
          <Crasher :crash="crash3" label="FlakyWidget" />
        </template>
        <template #fallback="{ error, retry, retryCount, canRetry }">
          <div class="fallback">
            <p>💥 {{ error.message }}</p>
            <p class="muted">retries: {{ retryCount }} / 2</p>
            <button :disabled="!canRetry" @click="retry">retry (still broken)</button>
          </div>
        </template>
      </ErrorBoundary>
    </section>

    <section class="panel">
      <h2>4. Nested boundaries — isolate</h2>
      <label class="muted">
        <input type="checkbox" v-model="isolate4" />
        isolate inner boundary (default true — errors stay local)
      </label>
      <ErrorBoundary
        ref="outerBoundary4"
        @error="(e) => (outerEvents = [`outer saw: ${e.message}`, ...outerEvents].slice(0, 4))"
      >
        <template #default>
          <div class="nested-host">
            <p class="muted">outer boundary content</p>
            <ErrorBoundary ref="innerBoundary4" :isolate="isolate4" :reporter="combinedReporter">
              <template #default>
                <Crasher :key="attempt4" :crash="crash4" label="InnerWidget" />
              </template>
              <template #fallback="{ error }">
                <div class="fallback">💥 inner: {{ error.message }}</div>
              </template>
            </ErrorBoundary>
          </div>
        </template>
        <template #fallback="{ error }">
          <div class="fallback">💥 outer took over: {{ error.message }}</div>
        </template>
      </ErrorBoundary>
      <div class="row">
        <button v-if="crash4" @click="fixNestedWidget">fix inner component</button>
        <button v-else @click="breakNestedWidgetAgain">break inner widget again</button>
      </div>
      <ul class="log">
        <li v-for="(e, i) in outerEvents" :key="i">{{ e }}</li>
      </ul>
    </section>

    <section class="panel">
      <h2>5. useErrorBoundary() — manual capture</h2>
      <p class="muted">
        For errors <code>errorCaptured</code> never sees (event handlers, timers, parsed data).
      </p>
      <button @click="triggerRawEventHandlerError">trigger + manually capture a JSON parse error</button>
      <div v-if="manual.hasError.value" class="fallback">
        💥 {{ manual.error.value?.message }}
        <button @click="manual.reset()">dismiss</button>
      </div>
    </section>

    <section class="panel">
      <h2>6. async setup() — source: "async"</h2>
      <ErrorBoundary :key="remount6" :reporter="combinedReporter">
        <template #default>
          <Suspense>
            <AsyncCrasher :crash="crash6" label="AsyncProfile" />
            <template #fallback>
              <div class="muted">loading…</div>
            </template>
          </Suspense>
        </template>
        <template #fallback="{ error }">
          <div class="fallback">💥 ({{ error.source }}) {{ error.message }}</div>
        </template>
      </ErrorBoundary>
      <button
        v-if="crash6"
        @click="
          () => {
            crash6 = false
            remount6++
          }
        "
      >
        fix &amp; remount
      </button>
      <button
        v-else
        @click="
          () => {
            crash6 = true
            remount6++
          }
        "
      >
        break it again
      </button>
    </section>

    <section class="panel">
      <h2>7 &amp; 8. Reporting adapters + useGlobalErrorCapture()</h2>
      <div class="row">
        <button @click="triggerUnhandledRejection">throw unhandled promise rejection</button>
        <button @click="triggerNativeListenerError">throw from raw addEventListener</button>
      </div>
      <p class="muted">Every boundary above also reports through the console adapter + this log:</p>
      <ul class="log">
        <li v-for="(entry, i) in reportLog" :key="i">{{ entry }}</li>
      </ul>
    </section>

    <section class="panel">
      <h2>9. Devtools — error history</h2>
      <p class="muted">
        Every boundary above shares <code>combinedReporter</code>, which also feeds
        <code>history.record</code> — no extra wiring beyond adding it to the reporter chain.
      </p>
      <ErrorHistoryPanel :history="history" />
    </section>

    <section class="panel">
      <h2>10. Rate-limit / dedup</h2>
      <p class="muted">
        <code>createRateLimitedReporter()</code> wraps a reporter with dedup (identical
        source+component+message within a window) and a max-per-window cap — for a mass-failure
        storm that would otherwise spam a real backend. maxPerWindow = 5.
      </p>
      <div class="row">
        <button @click="simulateIdenticalFailures">20× identical error (dedup)</button>
        <button @click="simulateDistinctFailures">20× distinct errors (rate-limit)</button>
      </div>
      <p class="muted">
        forwarded: {{ massFailureStats.forwarded }} · suppressed (dedup):
        {{ massFailureStats.dedup }} · suppressed (rate-limit): {{ massFailureStats.rateLimit }}
      </p>
    </section>
  </main>
</template>

<style>
:root {
  color-scheme: light dark;
  font-family:
    system-ui,
    -apple-system,
    Segoe UI,
    sans-serif;
}
body {
  margin: 0;
  background: canvas;
  color: canvastext;
}
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
}
h1 {
  margin-bottom: 0.25rem;
}
.lede {
  opacity: 0.75;
  line-height: 1.5;
}
.panel {
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  border-radius: 10px;
  padding: 1.25rem;
  margin: 1.5rem 0;
}
.panel h2 {
  margin-top: 0;
  font-size: 1.05rem;
}
.fallback {
  background: color-mix(in srgb, orangered 12%, transparent);
  border: 1px solid color-mix(in srgb, orangered 40%, transparent);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin: 0.5rem 0;
}
.crasher-ok {
  background: color-mix(in srgb, seagreen 12%, transparent);
  border: 1px solid color-mix(in srgb, seagreen 40%, transparent);
  border-radius: 8px;
  padding: 0.75rem 1rem;
}
.muted {
  opacity: 0.65;
  font-size: 0.9rem;
}
.nested-host {
  border: 1px dashed color-mix(in srgb, currentColor 25%, transparent);
  border-radius: 8px;
  padding: 0.75rem;
}
button {
  cursor: pointer;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  background: color-mix(in srgb, currentColor 6%, transparent);
  color: inherit;
  padding: 0.4rem 0.8rem;
  margin-top: 0.5rem;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.log {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0;
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  opacity: 0.85;
}
</style>
