import fs from 'node:fs'
import path from 'node:path'
import { extractMessages } from './extract.js'
import { listSourceFiles } from './files.js'
import type { ResolvedConfig } from '../types.js'

export interface SourceMessage {
  id: string
  source: string
  context?: string
  file: string
  line: number
}

export interface SourceIndex {
  messages: Map<string, SourceMessage>
  dynamic: { file: string; line: number }[]
  files: number
  /** Files that could not be scanned, e.g. saved in GBK instead of UTF-8. */
  skipped: { file: string; reason: string }[]
}

/** Scans the project and collects every translatable string. */
export function collectSources(root: string, config: ResolvedConfig): SourceIndex {
  const messages = new Map<string, SourceMessage>()
  const dynamic: { file: string; line: number }[] = []
  const skipped: { file: string; reason: string }[] = []
  const files = listSourceFiles(root, config)

  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8')
    const relative = path.relative(root, file).split(path.sep).join('/')

    // Invalid UTF-8 becomes U+FFFD; extracting that would create mojibake keys.
    if (code.includes('\uFFFD')) {
      skipped.push({ file: relative, reason: 'not valid UTF-8 (re-save the file as UTF-8)' })
      continue
    }

    // Wrapper modules may call t() without importing source-i18n themselves.
    const result = extractMessages(code, {
      file: relative,
      functions: config.extract.functions,
      force: config.extract.requireImport === false,
    })

    dynamic.push(...result.dynamic)
    for (const message of result.messages) {
      if (!messages.has(message.id)) {
        messages.set(message.id, {
          id: message.id,
          source: message.source,
          context: message.context,
          file: relative,
          line: message.line,
        })
      }
    }
  }

  return { messages, dynamic, files: files.length, skipped }
}
