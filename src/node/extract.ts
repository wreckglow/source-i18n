/**
 * A dependency-free scanner that finds `t('...')` calls.
 *
 * It is a tokenizer, not a full parser: it walks the source once, skipping
 * comments, strings, template literals and regex literals, and only inspects
 * identifier calls. That is enough to find string literals reliably and keeps
 * the plugin fast and dependency-free.
 *
 * Precision guard: a file is only scanned when it imports `source-i18n`,
 * so unrelated `t(...)` calls elsewhere are ignored.
 */

import { messageKey } from '../catalog.js'

export interface ExtractedMessage {
  id: string
  source: string
  context?: string
  file: string
  line: number
}

export interface ExtractResult {
  messages: ExtractedMessage[]
  /** `t(someVariable)` — build time translation is impossible for these. */
  dynamic: { file: string; line: number }[]
}

export interface ExtractOptions {
  file?: string
  /** Identifiers treated as translation calls. */
  functions?: string[]
  /** Scan even when the file does not import source-i18n. */
  force?: boolean
}

const IDENT_START = /[A-Za-z_$]/
const IDENT_PART = /[A-Za-z0-9_$]/

const REGEX_PREV = new Set([
  '',
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '+',
  '-',
  '*',
  '%',
  '^',
  '~',
  '<',
  '>',
  '{',
  '}',
  ';',
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'case',
  'do',
  'else',
  'yield',
  'await',
])

const IMPORT_RE =
  /(?:from\s*|import\s*|require\(\s*)['"]source-i18n(?:\/[a-zA-Z0-9._/-]+)?['"]|['"]virtual:source-i18n/

/** True when the module imports the runtime (our precision guard). */
export function importsKeyless(code: string): boolean {
  return IMPORT_RE.test(code)
}

export function extractMessages(code: string, options: ExtractOptions = {}): ExtractResult {
  if (!options.force && !importsKeyless(code)) return { messages: [], dynamic: [] }

  const file = options.file ?? '<unknown>'
  const functions = new Set(options.functions ?? ['t', '$t'])
  const messages: ExtractedMessage[] = []
  const dynamic: { file: string; line: number }[] = []

  const len = code.length
  let i = 0
  let prev = ''

  const lineAt = (index: number): number => {
    let line = 1
    for (let k = 0; k < index; k += 1) if (code.charCodeAt(k) === 10) line += 1
    return line
  }

  while (i < len) {
    const c = code[i]!

    // comments
    if (c === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i + 2)
      i = end === -1 ? len : end + 1
      continue
    }
    if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      i = end === -1 ? len : end + 2
      continue
    }

    // strings
    if (c === '"' || c === "'") {
      const lit = readStringLiteral(code, i)
      i = lit ? lit.end : i + 1
      prev = 'str'
      continue
    }

    // Template literals: the text itself is not code, but `${...}` is. Scan
    // every interpolation so `t()` inside a template is still extracted.
    if (c === '`') {
      const template = readTemplate(code, i)
      if (template) {
        for (const expression of template.expressions) {
          const inner = extractMessages(code.slice(expression.start, expression.end), {
            file,
            functions: [...functions],
            force: true,
          })
          const offset = lineAt(expression.start) - 1
          for (const message of inner.messages) {
            messages.push({ ...message, line: message.line + offset })
          }
          for (const entry of inner.dynamic) {
            dynamic.push({ file, line: entry.line + offset })
          }
        }
        i = template.end
      } else {
        i += 1
      }
      prev = 'str'
      continue
    }

    // regex literal vs division
    if (c === '/' && REGEX_PREV.has(prev)) {
      i = skipRegex(code, i)
      prev = 'regex'
      continue
    }

    // identifiers
    if (IDENT_START.test(c)) {
      const start = i
      i += 1
      while (i < len && IDENT_PART.test(code[i]!)) i += 1
      const word = code.slice(start, i)

      if (functions.has(word)) {
        let open = skipTrivia(code, i)

        // Optional call: t?.('...')
        if (code[open] === '?' && code[open + 1] === '.') {
          open = skipTrivia(code, open + 2)
        }

        // Generic call: t<...>('...')
        if (code[open] === '<') {
          const close = skipTypeArguments(code, open)
          if (close !== -1) open = skipTrivia(code, close + 1)
        }

        if (code[open] === '(') {
          const call = parseCall(code, open + 1)
          if (call) {
            if (call.sources.length > 0) {
              for (const source of call.sources) {
                messages.push({
                  id: messageKey(source, call.context),
                  source,
                  context: call.context,
                  file,
                  line: lineAt(start),
                })
              }
            } else {
              dynamic.push({ file, line: lineAt(start) })
            }
            i = call.end
            prev = ')'
            continue
          }
        }
      }

      prev = word
      continue
    }

    // numbers: just advance
    if (c >= '0' && c <= '9') {
      i += 1
      while (i < len && /[0-9a-fA-FxX._]/.test(code[i]!)) i += 1
      prev = 'num'
      continue
    }

    prev = c
    i += 1
  }

  return { messages, dynamic }
}

function skipTrivia(code: string, from: number): number {
  let i = from
  for (;;) {
    while (i < code.length && /\s/.test(code[i]!)) i += 1
    if (code[i] === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i + 2)
      i = end === -1 ? code.length : end + 1
      continue
    }
    if (code[i] === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      i = end === -1 ? code.length : end + 2
      continue
    }
    return i
  }
}

interface Literal {
  value: string
  end: number
}

function readStringLiteral(code: string, start: number): Literal | undefined {
  const quote = code[start]
  let i = start + 1
  let value = ''
  while (i < code.length) {
    const c = code[i]!
    if (c === '\\') {
      const esc = readEscape(code, i)
      if (!esc) return undefined
      value += esc.value
      i = esc.end
      continue
    }
    if (c === quote) return { value, end: i + 1 }
    if (c === '\n') return undefined // unterminated
    value += c
    i += 1
  }
  return undefined
}

function readEscape(code: string, start: number): { value: string; end: number } | undefined {
  const next = code[start + 1]
  if (next === undefined) return undefined
  switch (next) {
    case 'n':
      return { value: '\n', end: start + 2 }
    case 'r':
      return { value: '\r', end: start + 2 }
    case 't':
      return { value: '\t', end: start + 2 }
    case 'b':
      return { value: '\b', end: start + 2 }
    case 'f':
      return { value: '\f', end: start + 2 }
    case 'v':
      return { value: '\v', end: start + 2 }
    case '0':
      return { value: '\0', end: start + 2 }
    case '\n':
      return { value: '', end: start + 2 }
    case 'x': {
      const hex = code.slice(start + 2, start + 4)
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) return undefined
      return { value: String.fromCharCode(parseInt(hex, 16)), end: start + 4 }
    }
    case 'u': {
      if (code[start + 2] === '{') {
        const end = code.indexOf('}', start + 3)
        if (end === -1) return undefined
        const hex = code.slice(start + 3, end)
        if (!/^[0-9a-fA-F]+$/.test(hex)) return undefined
        return { value: String.fromCodePoint(parseInt(hex, 16)), end: end + 1 }
      }
      const hex = code.slice(start + 2, start + 6)
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return undefined
      return { value: String.fromCharCode(parseInt(hex, 16)), end: start + 6 }
    }
    default:
      return { value: next, end: start + 2 }
  }
}

interface TemplateParts {
  end: number
  expressions: { start: number; end: number }[]
}

/** Reads a template literal and the ranges of its `${...}` expressions. */
function readTemplate(code: string, start: number): TemplateParts | undefined {
  let i = start + 1
  const expressions: { start: number; end: number }[] = []
  while (i < code.length) {
    const c = code[i]!
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '`') return { end: i + 1, expressions }
    if (c === '$' && code[i + 1] === '{') {
      const end = findMatchingBrace(code, i + 2)
      if (end === -1) return undefined
      expressions.push({ start: i + 2, end })
      i = end + 1
      continue
    }
    i += 1
  }
  return undefined
}

function findMatchingBrace(code: string, from: number): number {
  let depth = 1
  let i = from
  while (i < code.length) {
    const c = code[i]!
    if (c === '"' || c === "'") {
      const lit = readStringLiteral(code, i)
      if (!lit) return -1
      i = lit.end
      continue
    }
    if (c === '`') {
      const template = readTemplate(code, i)
      if (!template) return -1
      i = template.end
      continue
    }
    if (c === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i + 2)
      i = end === -1 ? code.length : end + 1
      continue
    }
    if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      i = end === -1 ? code.length : end + 2
      continue
    }
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return i
    }
    i += 1
  }
  return -1
}

function skipTemplate(code: string, start: number): number {
  let i = start + 1
  let depth = 0
  while (i < code.length) {
    const c = code[i]!
    if (c === '\\') {
      i += 2
      continue
    }
    if (depth === 0 && c === '`') return i + 1
    if (c === '$' && code[i + 1] === '{') {
      depth += 1
      i += 2
      continue
    }
    if (depth > 0 && c === '}') {
      depth -= 1
      i += 1
      continue
    }
    i += 1
  }
  return code.length
}

function skipRegex(code: string, start: number): number {
  let i = start + 1
  let inClass = false
  while (i < code.length) {
    const c = code[i]!
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '[') inClass = true
    else if (c === ']') inClass = false
    else if (c === '/' && !inClass) {
      i += 1
      while (i < code.length && /[a-z]/i.test(code[i]!)) i += 1
      return i
    } else if (c === '\n') {
      return i
    }
    i += 1
  }
  return code.length
}

interface ParsedCall {
  /** One or more static strings; empty when the argument is not static. */
  sources: string[]
  context?: string
  end: number
}

function parseCall(code: string, from: number): ParsedCall | undefined {
  const start = skipTrivia(code, from)
  const close = findClosingParen(code, start)
  if (close === -1) return undefined

  const parsed = staticStrings(code, start)
  const args = code.slice(start, close)
  const match = /[,{]\s*context\s*:\s*(['"])((?:\\.|(?!\1)[\s\S])*?)\1/.exec(args)
  const context = match ? unescape(match[2]!) : undefined

  return { sources: parsed?.values ?? [], context, end: close + 1 }
}

interface StaticStrings {
  values: string[]
  end: number
}

function parseOperand(code: string, start: number): { value: string; end: number } | undefined {
  const i = skipTrivia(code, start)
  if (code[i] === '"' || code[i] === "'") {
    const lit = readStringLiteral(code, i)
    return lit ? { value: lit.value, end: lit.end } : undefined
  }
  if (code[i] === '`') {
    const lit = readTemplateLiteral(code, i)
    return lit ? { value: lit.value, end: lit.end } : undefined
  }
  return undefined
}

/**
 * Extracts every statically known string in the first argument.
 *
 * `t('a' + b)` stays dynamic (the runtime value is unknown), but conditional
 * branches, nullish/logical fallbacks, parenthesised expressions and fully
 * literal concatenations are all safe to extract.
 */
function staticStrings(code: string, start: number): StaticStrings | undefined {
  const from = skipTrivia(code, start)

  if (code[from] === '(') {
    const inner = staticStrings(code, from + 1)
    if (!inner) return undefined
    const close = skipTrivia(code, inner.end)
    return code[close] === ')' ? { values: inner.values, end: close + 1 } : undefined
  }

  const question = findTernaryQuestion(code, from)
  if (question !== -1) {
    const colon = findTernaryColon(code, question + 1)
    if (colon === -1) return undefined
    const consequent = staticStrings(code, question + 1)
    const alternate = staticStrings(code, colon + 1)
    const values = [...(consequent?.values ?? []), ...(alternate?.values ?? [])]
    if (values.length === 0) return undefined
    return { values: [...new Set(values)], end: alternate?.end ?? consequent?.end ?? colon + 1 }
  }

  const first = parseOperand(code, from)
  if (!first) {
    const logical = findTopLevelLogical(code, from)
    if (logical === -1) return undefined
    const right = staticStrings(code, logical + 2)
    return right ? { values: right.values, end: right.end } : undefined
  }

  let i = skipTrivia(code, first.end)

  if (code[i] === '+') {
    let value = first.value
    while (code[i] === '+') {
      const next = parseOperand(code, skipTrivia(code, i + 1))
      if (!next) return undefined
      value += next.value
      i = skipTrivia(code, next.end)
    }
    return { values: [value], end: i }
  }

  if ((code[i] === '?' && code[i + 1] === '?') || (code[i] === '|' && code[i + 1] === '|')) {
    const right = staticStrings(code, i + 2)
    const values = [first.value, ...(right?.values ?? [])]
    return { values: [...new Set(values)], end: right?.end ?? i + 2 }
  }

  return { values: [first.value], end: first.end }
}

/** Position of the `?` in a top-level ternary, skipping `?.`, `??` and literals. */
function findTernaryQuestion(code: string, from: number): number {
  let depth = 0
  for (let i = from; i < code.length; i++) {
    const c = code[i]!
    if (c === '"' || c === "'") {
      const lit = readStringLiteral(code, i)
      if (!lit) return -1
      i = lit.end - 1
      continue
    }
    if (c === '`') {
      i = skipTemplate(code, i) - 1
      continue
    }
    if (c === '(' || c === '[' || c === '{') {
      depth += 1
      continue
    }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return -1
      depth -= 1
      continue
    }
    if (depth === 0 && c === '?') {
      if (code[i + 1] === '.' || code[i + 1] === '?') {
        i += 1
        continue
      }
      return i
    }
    if (depth === 0 && c === ',') return -1
  }
  return -1
}

/** Matching `:` of a ternary, accounting for nested ternaries. */
function findTernaryColon(code: string, from: number): number {
  let depth = 0
  let nested = 0
  for (let i = from; i < code.length; i++) {
    const c = code[i]!
    if (c === '"' || c === "'") {
      const lit = readStringLiteral(code, i)
      if (!lit) return -1
      i = lit.end - 1
      continue
    }
    if (c === '`') {
      i = skipTemplate(code, i) - 1
      continue
    }
    if (c === '(' || c === '[' || c === '{') {
      depth += 1
      continue
    }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return -1
      depth -= 1
      continue
    }
    if (depth !== 0) continue
    if (c === '?') {
      if (code[i + 1] === '.' || code[i + 1] === '?') {
        i += 1
        continue
      }
      nested += 1
      continue
    }
    if (c === ':') {
      if (nested === 0) return i
      nested -= 1
      continue
    }
    if (c === ',') return -1
  }
  return -1
}

function findTopLevelLogical(code: string, from: number): number {
  let depth = 0
  for (let i = from; i < code.length; i++) {
    const c = code[i]!
    if (c === '"' || c === "'") {
      const lit = readStringLiteral(code, i)
      if (!lit) return -1
      i = lit.end - 1
      continue
    }
    if (c === '`') {
      i = skipTemplate(code, i) - 1
      continue
    }
    if (c === '(' || c === '[' || c === '{') {
      depth += 1
      continue
    }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return -1
      depth -= 1
      continue
    }
    if (depth === 0 && ((c === '?' && code[i + 1] === '?') || (c === '|' && code[i + 1] === '|'))) {
      return i
    }
    if (depth === 0 && c === ',') return -1
  }
  return -1
}

function readTemplateLiteral(code: string, start: number): Literal | undefined {
  let i = start + 1
  let value = ''
  while (i < code.length) {
    const c = code[i]!
    if (c === '\\') {
      const esc = readEscape(code, i)
      if (!esc) return undefined
      value += esc.value
      i = esc.end
      continue
    }
    if (c === '$' && code[i + 1] === '{') return undefined // dynamic
    if (c === '`') return { value, end: i + 1 }
    value += c
    i += 1
  }
  return undefined
}

/**
 * Returns the index of the ">" closing a type argument list, or -1 when the
 * "<" was not a type argument (comparison, arrow function, ...).
 */
function skipTypeArguments(code: string, start: number): number {
  let depth = 0
  let i = start
  while (i < code.length && i - start < 300) {
    const c = code[i]!
    if (c === '<') depth += 1
    else if (c === '>') {
      depth -= 1
      if (depth === 0) return i
    } else if (c === ';' || c === '{' || c === '}' || c === '=' || c === '`' || c === '\n') {
      return -1
    }
    i += 1
  }
  return -1
}

function unescape(raw: string): string {
  return raw.replace(/\\(['"\\])/g, '$1')
}

/** Finds the ")" matching an already-open call, skipping nested strings. */
function findClosingParen(code: string, from: number): number {
  let depth = 1
  let i = from
  while (i < code.length) {
    const c = code[i]!
    if (c === '"' || c === "'") {
      const lit = readStringLiteral(code, i)
      i = lit ? lit.end : i + 1
      continue
    }
    if (c === '`') {
      i = skipTemplate(code, i)
      continue
    }
    if (c === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i + 2)
      i = end === -1 ? code.length : end + 1
      continue
    }
    if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      i = end === -1 ? code.length : end + 2
      continue
    }
    if (c === '(') depth += 1
    else if (c === ')') {
      depth -= 1
      if (depth === 0) return i
    }
    i += 1
  }
  return -1
}
