import { getI18n, type I18n, type TranslateOptions } from './index.js'

export interface Readable<T> {
  subscribe(run: (value: T) => void): () => void
}

export type TFunction = (
  source: string,
  params?: Record<string, unknown>,
  options?: TranslateOptions,
) => string

/** `$locale` in a Svelte component. */
export function locale(instance?: I18n): Readable<string> {
  const i18n = instance ?? getI18n()
  return {
    subscribe(run) {
      run(i18n.locale)
      return i18n.subscribe(() => run(i18n.locale))
    },
  }
}

/**
 * `$t('Save project')` in a Svelte component.
 * The store value is the function itself, so the template tracks the locale.
 */
export function translator(instance?: I18n): Readable<TFunction> {
  const i18n = instance ?? getI18n()
  return {
    subscribe(run) {
      run(i18n.t)
      return i18n.subscribe(() => run(i18n.t))
    },
  }
}

export const t = translator
export const useT = translator
