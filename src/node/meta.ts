import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { writeFileAtomic } from './files.js'

export interface MetaEntry {
  by: 'mt' | 'tm' | 'human'
  /** Fingerprint of the machine translation, used to detect human edits. */
  h: string
}

export interface MetaFile {
  version: 1
  messages: Record<string, MetaEntry>
}

export function fingerprint(text: string): string {
  return createHash('sha1').update(text).digest('hex').slice(0, 10)
}

export function readMeta(file: string): MetaFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as MetaFile
    if (parsed && typeof parsed === 'object' && parsed.messages) return parsed
  } catch {
    /* missing or unreadable meta is fine */
  }
  return { version: 1, messages: {} }
}

export function writeMeta(file: string, meta: MetaFile): void {
  // Same atomic write as catalogs: a crash must not leave a truncated file that
  // silently drops the human-edit fingerprints.
  writeFileAtomic(file, JSON.stringify(meta, null, 2) + '\n')
}

/** True when the stored translation is still exactly what the machine produced. */
export function isUntouchedMachine(meta: MetaFile, id: string, current: string | undefined): boolean {
  if (current === undefined) return false
  const entry = meta.messages[id]
  if (!entry || entry.by === 'human') return false
  return entry.h === fingerprint(current)
}
