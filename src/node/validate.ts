import { assertValidMessage, placeholdersOf } from '../format.js'

export type IssueKind = 'empty' | 'syntax' | 'placeholders' | 'identical'

export interface ValidationIssue {
  kind: IssueKind
  detail?: string
  /** Blocking issues must not be written to the catalog. */
  blocking: boolean
}

/**
 * Checks a machine translation before it is persisted.
 * A translation that loses a placeholder would crash at render time, so those
 * are rejected instead of shipped.
 */
export function validateTranslation(source: string, translation: string): ValidationIssue | undefined {
  if (!translation || !translation.trim()) return { kind: 'empty', blocking: true }

  try {
    assertValidMessage(translation)
  } catch (error) {
    return { kind: 'syntax', detail: (error as Error).message, blocking: true }
  }

  const expected = placeholdersOf(source)
  const actual = placeholdersOf(translation)

  const missing = expected.filter((name) => !actual.includes(name))
  const extra = actual.filter((name) => !expected.includes(name))
  if (missing.length || extra.length) {
    const parts: string[] = []
    if (missing.length) parts.push(`missing {${missing.join('}, {')}}`)
    if (extra.length) parts.push(`unexpected {${extra.join('}, {')}}`)
    return { kind: 'placeholders', detail: parts.join(', '), blocking: true }
  }

  if (translation.trim() === source.trim() && /[A-Za-z\u4e00-\u9fff]/.test(source)) {
    return { kind: 'identical', detail: 'translation equals the source text', blocking: false }
  }

  return undefined
}
