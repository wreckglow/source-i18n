import { getCurrentScope, inject, onScopeDispose, shallowRef, type App, type Ref } from 'vue'
import { getI18n, type I18n, type TranslateOptions } from './index.js'

const I18N_KEY = Symbol.for('source-i18n')

export type TFunction = (
  source: string,
  params?: Record<string, unknown>,
  options?: TranslateOptions,
) => string

export interface KeylessVuePlugin {
  i18n: I18n
  install(app: App): void
}

/**
 * `app.use(createI18nPlugin())`
 *
 * Registers `$t` / `$i18n` on the app and provides the instance to `useT()`.
 */
export function createI18nPlugin(instance?: I18n): KeylessVuePlugin {
  const i18n = instance ?? getI18n()
  return {
    i18n,
    install(app: App) {
      app.provide(I18N_KEY, i18n)
      app.config.globalProperties.$t = i18n.t
      app.config.globalProperties.$i18n = i18n
    },
  }
}

function useInstance(instance?: I18n): I18n {
  // Short-circuit before inject() so this also works outside a component
  // (tests, utilities) when an instance is passed explicitly.
  if (instance) return instance
  const injected = inject(I18N_KEY, null) as I18n | null
  return injected ?? getI18n()
}

function useVersion(i18n: I18n): Ref<number> {
  const version = shallowRef(0)
  const unsubscribe = i18n.subscribe(() => {
    version.value += 1
  })
  if (getCurrentScope()) onScopeDispose(unsubscribe)
  return version
}

/** Reactive `t`: the template re-renders when the locale changes. */
export function useT(instance?: I18n): TFunction {
  const i18n = useInstance(instance)
  const version = useVersion(i18n)
  return (source, params, options) => {
    void version.value // dependency for the template effect
    return i18n.t(source, params, options)
  }
}

export function useLocale(instance?: I18n): Ref<string> {
  const i18n = useInstance(instance)
  const locale = shallowRef(i18n.locale)
  const unsubscribe = i18n.subscribe(() => {
    locale.value = i18n.locale
  })
  if (getCurrentScope()) onScopeDispose(unsubscribe)
  return locale
}

export function useSetLocale(instance?: I18n): (locale: string) => void {
  const i18n = useInstance(instance)
  return (locale: string) => i18n.setLocale(locale)
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $t: TFunction
    $i18n: I18n
  }
}
