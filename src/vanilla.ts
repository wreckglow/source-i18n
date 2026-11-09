import { subscribe, t } from './index.js'

export interface DomOptions {
  /** Attribute holding the message id. Default "data-i18n". */
  attribute?: string
  /** Optional attribute on the element that should receive the text instead of textContent. */
  targetAttribute?: string
}

/**
 * Translates `[data-i18n]` elements and keeps them in sync with the locale.
 * Works in plain HTML pages, Electron renderers and anything else with a DOM.
 *
 *   <button data-i18n="Save project"></button>
 */
export function translateDom(root?: ParentNode, options: DomOptions = {}): () => void {
  // A caller-provided root is enough; the global document is only a default.
  if (!root && typeof document === 'undefined') return () => {}

  const scope = root ?? document
  const attribute = options.attribute ?? 'data-i18n'
  const targetAttribute = options.targetAttribute ?? 'data-i18n-attr'

  const apply = (): void => {
    for (const element of scope.querySelectorAll(`[${attribute}]`)) {
      const key = element.getAttribute(attribute)
      if (!key) continue
      const value = t(key)
      const target = element.getAttribute(targetAttribute)
      if (target) element.setAttribute(target, value)
      else element.textContent = value
    }
  }

  apply()
  return subscribe(apply)
}
