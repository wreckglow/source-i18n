import fs from 'node:fs'
import path from 'node:path'
import { normalizeCatalogFile, stringifyCatalog } from '../catalog.js'
import { normalizeLocale } from '../format.js'
import type { ResolvedConfig } from '../types.js'
import { writeFileAtomic } from './files.js'

export interface FormattedFile {
  locale: string
  changed: boolean
  /** Set when the file was renamed to its canonical locale tag (zh_cn -> zh-CN). */
  renamedFrom?: string
}

export interface FormatReport {
  files: FormattedFile[]
  changed: number
}

function isCatalog(name: string): boolean {
  return name.endsWith('.json') && !name.endsWith('.meta.json') && !name.endsWith('.cache.json')
}

/**
 * Normalises every catalog in place: canonical locale tag, sorted keys,
 * stable formatting, string values only. With `check`, nothing is written and
 * the report tells you whether the repository is already normalised.
 */
export function formatProject(options: { root: string; config: ResolvedConfig; check?: boolean }): FormatReport {
  const { root, config, check } = options
  const dir = path.join(root, config.catalogs)
  const report: FormatReport = { files: [], changed: 0 }
  if (!fs.existsSync(dir)) return report

  const entries = fs.readdirSync(dir).filter(isCatalog).sort()

  // zh_cn.json and zh-CN.json both normalise to zh-CN.json. Detect this before
  // writing anything, otherwise one file silently overwrites the other.
  const owners = new Map<string, string>()
  for (const entry of entries) {
    const locale = normalizeLocale(entry.slice(0, -'.json'.length))
    const previous = owners.get(locale)
    if (previous) {
      throw new Error(
        `source-i18n: both ${previous} and ${entry} normalise to ${locale}.json; merge them manually first`,
      )
    }
    owners.set(locale, entry)
  }

  for (const entry of entries) {
    const fileLocale = entry.slice(0, -'.json'.length)
    const locale = normalizeLocale(fileLocale)
    const sourcePath = path.join(dir, entry)
    const targetPath = path.join(dir, `${locale}.json`)

    const raw = fs.readFileSync(sourcePath, 'utf8')
    const parsed = normalizeCatalogFile(JSON.parse(raw), locale)
    const next = stringifyCatalog(locale, config.source, parsed.messages)

    const renamed = entry !== `${locale}.json`
    const changed = next !== raw || renamed

    if (!check && changed) {
      writeFileAtomic(targetPath, next)
      if (renamed) fs.rmSync(sourcePath, { force: true })
    }

    report.files.push({ locale, changed, ...(renamed ? { renamedFrom: entry } : {}) })
    if (changed) report.changed += 1
  }

  return report
}
