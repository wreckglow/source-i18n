import { createContext, createElement, useCallback, useContext, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { getI18n, type I18n, type TranslateOptions } from './index.js'

export type TFunction = (
  source: string,
  params?: Record<string, unknown>,
  options?: TranslateOptions,
) => string

export const I18nContext = createContext<I18n | null>(null)

/**
 * Optional. Without it, components use the default instance created by the
 * virtual module — which is what most apps need.
 */
export function I18nProvider(props: { instance?: I18n; children?: ReactNode }) {
  return createElement(I18nContext.Provider, { value: props.instance ?? null }, props.children)
}

function useInstance(instance?: I18n): I18n {
  const fromContext = useContext(I18nContext)
  return instance ?? fromContext ?? getI18n()
}

/** Returns `t` and re-renders the component when the locale changes. */
export function useT(instance?: I18n): TFunction {
  const i18n = useInstance(instance)
  useSyncExternalStore(i18n.subscribe, i18n.getSnapshot, i18n.getSnapshot)
  return i18n.t
}

export function useLocale(instance?: I18n): string {
  const i18n = useInstance(instance)
  return useSyncExternalStore(
    i18n.subscribe,
    () => i18n.locale,
    () => i18n.locale,
  )
}

export function useSetLocale(instance?: I18n): (locale: string) => void {
  const i18n = useInstance(instance)
  return useCallback((locale: string) => i18n.setLocale(locale), [i18n])
}

/** The instance in use (useful for `setLocale`, `getLocales`, ...). */
export function useI18n(instance?: I18n): I18n {
  return useInstance(instance)
}
