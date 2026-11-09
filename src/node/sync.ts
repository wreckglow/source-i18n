import { splitKey } from '../catalog.js'
import { placeholdersOf } from '../format.js'
import type { Catalog, Provider, ResolvedConfig, TranslateResult } from '../types.js'
import { catalogPath, metaPath, readCatalog, writeCatalog } from './catalog-io.js'
import { withFileLock } from './files.js'
import { fingerprint, isUntouchedMachine, readMeta, writeMeta } from './meta.js'
import { createProvider } from './providers/index.js'
import { collectSources, type SourceMessage } from './sources.js'
import { findTranslationMemory } from './tm.js'
import { validateTranslation } from './validate.js'

export { catalogPath, metaPath, readCatalog } from './catalog-io.js'

const BATCH_ITEMS = 24
const BATCH_CHARS = 4000
const TM_THRESHOLD = 0.9

export interface SyncOptions {
  root: string
  config: ResolvedConfig
  locales?: string[]
  dryRun?: boolean
  /** Retranslate machine output that has not been edited by a human. */
  force?: boolean
  /** Delete untouched machine translations whose source string no longer exists. */
  prune?: boolean
  /** With prune, also delete hand-added entries whose source string no longer exists. */
  pruneManual?: boolean
  /** Reuse translations of renamed source strings. Default true. */
  tm?: boolean
  provider?: Provider
  onProgress?: (line: string) => void
}

export interface SyncIssue {
  id: string
  source: string
  kind: string
  detail?: string
}

export interface LocaleSyncReport {
  locale: string
  total: number
  existing: number
  translated: number
  fromMemory: number
  missing: number
  identical: number
  pruned: number
  changed: boolean
  issues: SyncIssue[]
}

export interface SyncReport {
  locales: LocaleSyncReport[]
  sources: number
  files: number
  dynamic: { file: string; line: number }[]
  skipped: { file: string; reason: string }[]
  /** Strings with more than one numeric placeholder: no ICU plural is generated. */
  plural: { id: string; source: string; placeholders: string[] }[]
  dryRun: boolean
  characters: number
}

/** Extracts and machine-translates everything that is missing. */
export async function sync(options: SyncOptions): Promise<SyncReport> {
  const { root, config } = options
  const index = collectSources(root, config)
  const provider = options.provider ?? createProvider(config)
  const locales = options.locales?.length ? options.locales : config.locales
  const dryRun = options.dryRun === true

  const plural: SyncReport['plural'] = []
  for (const message of index.messages.values()) {
    const numeric = placeholdersOf(message.source).filter((name) =>
      config.plural.placeholders.includes(name),
    )
    if (numeric.length > 1) {
      plural.push({ id: message.id, source: message.source, placeholders: numeric })
    }
  }

  const report: SyncReport = {
    locales: [],
    sources: index.messages.size,
    files: index.files,
    dynamic: index.dynamic,
    skipped: index.skipped,
    plural,
    dryRun,
    characters: 0,
  }

  for (const locale of locales) {
    report.locales.push(await syncLocale(locale, index.messages, provider, { ...options, dryRun }, report))
  }

  return report
}

async function syncLocale(
  locale: string,
  messages: Map<string, SourceMessage>,
  provider: Provider,
  options: SyncOptions & { dryRun: boolean },
  report: SyncReport,
): Promise<LocaleSyncReport> {
  const { root, config } = options
  const file = catalogPath(root, config, locale)
  const existing = readCatalog(file, locale)
  const meta = readMeta(metaPath(root, config, locale))

  const ids = new Set(messages.keys())
  const stale = Object.keys(existing).filter((id) => !ids.has(id))

  const pending: SourceMessage[] = []
  for (const message of messages.values()) {
    const current = existing[message.id]
    if (current === undefined) pending.push(message)
    else if (options.force && isUntouchedMachine(meta, message.id, current)) pending.push(message)
  }

  const existingCovered = [...ids].filter((id) => existing[id] !== undefined).length

  const produced: Catalog = {}
  const producedByMemory = new Set<string>()
  const issues: SyncIssue[] = []
  let identical = 0
  let fromMemory = 0

  // 1. translation memory: reuse the translation of an edited source string
  if (options.tm !== false && stale.length > 0 && pending.length > 0) {
    const memory = stale
      .map((id) => ({ id, source: splitKey(id).source, translation: existing[id] ?? '' }))
      .filter((entry) => entry.translation.length > 0)

    const remaining: SourceMessage[] = []
    for (const message of pending) {
      const hit = memory.length ? findTranslationMemory(message.source, memory, TM_THRESHOLD) : undefined
      if (hit) {
        produced[message.id] = hit.translation
        producedByMemory.add(message.id)
        fromMemory += 1
      } else {
        remaining.push(message)
      }
    }
    pending.length = 0
    pending.push(...remaining)
  }

  // 2. machine translation
  const characters = pending.reduce((total, message) => total + message.source.length, 0)
  report.characters += characters

  if (!options.dryRun && pending.length > 0 && provider.name !== 'manual') {
    for (const batch of makeBatches(pending)) {
      const outcome = await translateBatch(provider, batch, locale, config)
      Object.assign(produced, outcome.translations)
      identical += outcome.identical
      issues.push(...outcome.issues)
    }
  } else if (options.dryRun && pending.length > 0) {
    for (const message of pending) {
      issues.push({ id: message.id, source: message.source, kind: 'pending' })
    }
  }

  // 3. merge
  // Prune only deletes translations it can prove are untouched machine output.
  // Human edits and untracked entries survive, so manually added fragments are
  // never lost just because the extractor cannot see them.
  const merged: Catalog = {}
  let prunedCount = 0
  for (const [id, value] of Object.entries(existing)) {
    if (options.prune && !ids.has(id)) {
      if (isUntouchedMachine(meta, id, value)) {
        prunedCount += 1
      } else if (options.pruneManual) {
        // Explicit opt-in: the user confirmed these manual entries are obsolete.
        prunedCount += 1
      } else {
        // Human edits and entries without provenance are not provably stale.
        merged[id] = value
      }
      continue
    }
    merged[id] = value
  }
  Object.assign(merged, produced)

  const changed =
    Object.keys(merged).length !== Object.keys(existing).length ||
    Object.keys(merged).some((id) => merged[id] !== existing[id])

  if (!options.dryRun && changed) {
    /*
     * Translation can take minutes, and a running dev server may write to this
     * catalog in the meantime. Re-read under the cross-process lock (the same
     * one the dev server uses) so those strings are merged instead of lost.
     */
    withFileLock(file, () => {
      const fresh = readCatalog(file, locale)
      for (const [id, value] of Object.entries(fresh)) {
        if (existing[id] === undefined && merged[id] === undefined) merged[id] = value
      }
      writeCatalog(file, locale, config.source, merged)
    })

    for (const id of Object.keys(produced)) {
      meta.messages[id] = {
        by: producedByMemory.has(id) ? 'tm' : 'mt',
        h: fingerprint(produced[id]!),
      }
    }
    if (config.provenance !== false) writeMeta(metaPath(root, config, locale), meta)
  }

  const covered = [...ids].filter((id) => merged[id] !== undefined).length
  const pruned = prunedCount

  return {
    locale,
    total: ids.size,
    existing: existingCovered,
    translated: Object.keys(produced).length - fromMemory,
    fromMemory,
    missing: ids.size - covered,
    identical,
    pruned,
    changed,
    issues,
  }
}

async function translateBatch(
  provider: Provider,
  batch: SourceMessage[],
  locale: string,
  config: ResolvedConfig,
): Promise<{ translations: Catalog; issues: SyncIssue[]; identical: number }> {
  const request = (items: SourceMessage[]) => ({
    items: items.map((message) => ({
      id: message.id,
      text: message.source,
      context: message.context,
    })),
    from: config.source,
    to: locale,
    glossary: config.glossary,
    pluralPlaceholders: config.plural.placeholders,
  })

  const translations: Catalog = {}
  const issues = new Map<string, SyncIssue>()
  let identical = 0

  const consume = (result: TranslateResult, items: SourceMessage[]) => {
    const failed: SourceMessage[] = []
    for (const message of items) {
      const candidate = result[message.id]
      if (typeof candidate !== 'string' || !candidate.trim()) {
        failed.push(message)
        continue
      }
      const issue = validateTranslation(message.source, candidate)
      if (issue?.blocking) {
        issues.set(message.id, {
          id: message.id,
          source: message.source,
          kind: issue.kind,
          detail: issue.detail,
        })
        failed.push(message)
        continue
      }
      if (issue?.kind === 'identical') identical += 1
      issues.delete(message.id)
      translations[message.id] = candidate
    }
    return failed
  }

  let failed: SourceMessage[]
  try {
    failed = consume(await provider.translate(request(batch)), batch)
  } catch (error) {
    return {
      translations,
      identical,
      issues: batch.map((message) => ({
        id: message.id,
        source: message.source,
        kind: 'provider',
        detail: (error as Error).message,
      })),
    }
  }

  // One retry for the strings that came back broken (usually a lost placeholder).
  if (failed.length > 0 && failed.length < batch.length) {
    try {
      consume(await provider.translate(request(failed)), failed)
    } catch {
      /* keep the first issues */
    }
  }

  return { translations, issues: [...issues.values()], identical }
}

function makeBatches(messages: SourceMessage[]): SourceMessage[][] {
  const batches: SourceMessage[][] = []
  let current: SourceMessage[] = []
  let characters = 0

  for (const message of messages) {
    if (current.length >= BATCH_ITEMS || (current.length > 0 && characters + message.source.length > BATCH_CHARS)) {
      batches.push(current)
      current = []
      characters = 0
    }
    current.push(message)
    characters += message.source.length
  }
  if (current.length) batches.push(current)
  return batches
}
