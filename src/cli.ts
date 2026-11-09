#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { DEFAULT_CATALOGS } from './config.js'
import { checkProject } from './node/check.js'
import { findConfigFile, loadConfig } from './node/config.js'
import { formatProject } from './node/normalize.js'
import { collectSources } from './node/sources.js'
import { sync } from './node/sync.js'

const useColor = Boolean(process.stdout.isTTY) && !('NO_COLOR' in process.env)
const paint = (code: string, text: string): string =>
  useColor ? `\u001b[${code}m${text}\u001b[0m` : text
const bold = (text: string) => paint('1', text)
const dim = (text: string) => paint('2', text)
const green = (text: string) => paint('32', text)
const red = (text: string) => paint('31', text)
const yellow = (text: string) => paint('33', text)

const count = (value: number, word: string): string => `${value} ${word}${value === 1 ? '' : 's'}`

const HELP = `
${bold('source-i18n')} — i18n without keys

${bold('Usage')}
  source-i18n <command> [options]

${bold('Commands')}
  init      create source-i18n.config.mjs (asks 2 questions)
  extract   list the strings found in your source code
  sync      extract + machine translate what is missing
  format    normalise catalogs (sort keys, canonical locale tags)
  check     fail when translations are missing or broken (for CI)
  skill     copy the portable Agent Skill into a client's skills directory

${bold('Options')}
  --root <dir>          project root (default: cwd)
  --config <file>       explicit config file
  --locale <tag>        limit to one or more locales (repeatable)
  --dry-run             sync: show what would be translated
  --force               sync: retranslate machine output (keeps human edits); skill: overwrite
  --dir <path>          skill: destination skills directory, relative to root
  --prune               sync: drop untouched machine translations whose source disappeared
  --prune-manual        sync: also drop hand-added stale entries (implies --prune)
  --no-tm               sync: do not reuse translations of edited strings
  --strict              check: also fail on dynamic calls and provably stale machine entries
  --json                check: machine readable output
  --ascii               escape non-ASCII output as \\uXXXX (for consoles that garble Chinese)
  --check               format: exit 1 when files need normalising
  --yes, -y             init: accept defaults, do not ask
  --source <tag>        init: source language
  --locales <a,b>       init: target languages
  --provider <name>     init: openai | deepl | ollama | manual
`

const NON_ASCII = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g

function installAsciiOutput(): void {
  const escape = (value: string): string =>
    value.replace(NON_ASCII, (char) => `\\u${char.codePointAt(0)!.toString(16).padStart(4, '0')}`)

  for (const method of ['log', 'error'] as const) {
    const original = console[method].bind(console) as (...args: unknown[]) => void
    ;(console as unknown as Record<string, (...args: unknown[]) => void>)[method] = (...args: unknown[]) =>
      original(...args.map((arg) => (typeof arg === 'string' ? escape(arg) : arg)))
  }
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2)
  const command = raw[0] && !raw[0].startsWith('-')
    ? raw[0]
    : raw[0] === '--version' || raw[0] === '-v' || raw[0] === '-V'
      ? 'version'
      : 'help'

  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs({
      args: raw[0] && !raw[0].startsWith('-') ? raw.slice(1) : raw,
      options: {
        root: { type: 'string' },
        config: { type: 'string' },
        locale: { type: 'string', multiple: true },
        'dry-run': { type: 'boolean' },
        dir: { type: 'string' },
        force: { type: 'boolean' },
        prune: { type: 'boolean' },
        'prune-manual': { type: 'boolean' },
        tm: { type: 'boolean' },
        'no-tm': { type: 'boolean' },
        strict: { type: 'boolean' },
        json: { type: 'boolean' },
        ascii: { type: 'boolean' },
        check: { type: 'boolean' },
        yes: { type: 'boolean', short: 'y' },
        help: { type: 'boolean', short: 'h' },
        source: { type: 'string' },
        locales: { type: 'string' },
        provider: { type: 'string' },
        version: { type: 'boolean', short: 'v' },
      },
      allowPositionals: true,
      strict: true,
    })
  } catch (error) {
    // A typo like `--dryrun` must never fall through to a real, paid sync.
    console.error(red(`source-i18n: ${(error as Error).message}`))
    console.error(dim('run "source-i18n --help" for the available options'))
    process.exitCode = 1
    return
  }

  const values = parsed.values as Record<string, string | boolean | string[] | undefined>

  // `--help` after a command (`source-i18n sync --help`) prints help instead of
  // running the command.
  if (values.help === true) {
    console.log(HELP)
    return
  }

  // Some Windows consoles use a non-UTF-8 code page, so a quoted Chinese source
  // string can print as mojibake. `--ascii` keeps the output pure ASCII.
  if (values.ascii === true || process.env.SOURCE_I18N_ASCII === '1') {
    installAsciiOutput()
  }

  const root = path.resolve(String(values.root ?? process.cwd()))

  switch (command) {
    case 'help':
      console.log(HELP)
      return
    case 'version':
      console.log(readVersion())
      return
    case 'init':
      await init(root, values)
      return
    case 'extract':
      await extract(root, values)
      return
    case 'sync':
      await runSync(root, values)
      return
    case 'format':
      await runFormat(root, values)
      return
    case 'check':
      await runCheck(root, values)
      return
    case 'skill':
      installSkill(root, values)
      return
    default:
      console.error(red(`unknown command: ${command}`))
      console.log(HELP)
      process.exitCode = 1
  }
}

function installSkill(root: string, values: Record<string, unknown>): void {
  const dir = typeof values.dir === 'string' ? values.dir : undefined
  if (!dir) {
    console.error(red('skill needs --dir <path> (for example --dir .claude/skills)'))
    process.exitCode = 1
    return
  }

  const source = fileURLToPath(new URL('../../skills/source-i18n', import.meta.url))
  if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
    console.error(red('skill files are missing from this package'))
    process.exitCode = 1
    return
  }

  const skillsDir = path.resolve(root, dir)
  const target = path.join(skillsDir, 'source-i18n')
  if (fs.existsSync(target) && values.force !== true) {
    console.error(red(`skill already exists at ${target}`))
    console.error(dim('pass --force to overwrite it'))
    process.exitCode = 1
    return
  }

  fs.mkdirSync(skillsDir, { recursive: true })
  fs.cpSync(source, target, { recursive: true, force: true })
  console.log(green('✓') + ` installed Agent Skill to ${target}`)
  console.log(dim('  point your Agent Skills client at that skills directory'))
}

function readVersion(): string {
  try {
    const file = new URL('../../package.json', import.meta.url)
    return (JSON.parse(fs.readFileSync(file, 'utf8')) as { version: string }).version
  } catch {
    return '0.0.0'
  }
}

async function load(root: string, values: Record<string, unknown>) {
  try {
    return await loadConfig(root, values.config as string | undefined)
  } catch (error) {
    console.error(red((error as Error).message))
    process.exit(1)
  }
}

function localeList(values: Record<string, unknown>): string[] | undefined {
  const locales = values.locale
  if (!locales) return undefined
  return Array.isArray(locales) ? (locales as string[]) : [String(locales)]
}

async function init(root: string, values: Record<string, unknown>): Promise<void> {
  fs.mkdirSync(root, { recursive: true })
  const existing = findConfigFile(root)
  if (existing && values.yes !== true) {
    console.log(yellow(`config already exists: ${path.relative(root, existing)}`))
    console.log(dim('delete it first, or pass --yes to overwrite'))
    return
  }

  let source = typeof values.source === 'string' ? values.source : undefined
  let locales = typeof values.locales === 'string'
    ? values.locales.split(',').map((part) => part.trim()).filter(Boolean)
    : undefined
  let provider = typeof values.provider === 'string' ? values.provider : undefined

  if ((!source || !locales) && values.yes !== true && process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    try {
      const answer = (await rl.question(`Source language ${dim('(zh-CN)')}: `)).trim()
      source ??= answer || 'zh-CN'

      const suggested = source.toLowerCase().startsWith('en') ? 'zh-CN' : 'en-US'
      const targets = (await rl.question(`Target languages, comma separated ${dim(`(${suggested})`)}: `)).trim()
      locales ??= targets ? targets.split(',').map((part) => part.trim()).filter(Boolean) : [suggested]

      const chosen = (await rl.question(`Provider ${dim('(openai/deepl/ollama/manual)')} (openai): `)).trim()
      provider ??= chosen || 'openai'
    } finally {
      rl.close()
    }
  }

  source ??= 'zh-CN'
  locales = locales?.length ? locales : [source.toLowerCase().startsWith('en') ? 'zh-CN' : 'en-US']
  provider ??= 'openai'

  const file = path.join(root, 'source-i18n.config.mjs')
  const contents = `import { defineConfig } from 'source-i18n'

export default defineConfig({
  source: ${JSON.stringify(source)},
  locales: ${JSON.stringify(locales)},
  provider: ${JSON.stringify(provider)},
  // true sends missing strings to the provider while developing
  dev: { autoTranslate: false },
})
`
  fs.writeFileSync(file, contents, 'utf8')
  fs.mkdirSync(path.join(root, DEFAULT_CATALOGS), { recursive: true })

  console.log(green('✓') + ` created ${path.relative(root, file)}`)
  console.log('')
  console.log(bold('next steps'))
  console.log(`  1. ${dim('vite')}    import keyless from 'source-i18n/unplugin/vite'`)
  console.log(`             plugins: [keyless()]`)
  console.log(`  2. ${dim('code')}    import { t } from 'source-i18n'; t('Hello world')`)
  console.log(`  3. ${dim('fill')}    npx source-i18n sync`)
  console.log(`  4. ${dim('ci')}      npx source-i18n check --strict`)
}

function printSkipped(skipped: { file: string; reason: string }[]): void {
  if (skipped.length === 0) return
  console.log(yellow(`  skipped ${count(skipped.length, 'file')}:`))
  for (const entry of skipped.slice(0, 10)) {
    console.log(dim(`    ${entry.file} — ${entry.reason}`))
  }
  if (skipped.length > 10) console.log(dim(`    ... and ${skipped.length - 10} more`))
}

async function extract(root: string, values: Record<string, unknown>): Promise<void> {
  const config = await load(root, values)
  if (!config) return
  const index = collectSources(config.root, config)

  console.log(bold('source-i18n extract'))
  console.log(`  ${count(index.messages.size, 'string')} from ${count(index.files, 'file')}`)

  if (index.dynamic.length > 0) {
    console.log(yellow(`  ${index.dynamic.length} dynamic call(s) cannot be translated at build time:`))
    for (const entry of index.dynamic.slice(0, 20)) {
      console.log(dim(`    ${entry.file}:${entry.line}`))
    }
    if (index.dynamic.length > 20) console.log(dim(`    ... and ${index.dynamic.length - 20} more`))
  }

  printSkipped(index.skipped)
}

async function runSync(root: string, values: Record<string, unknown>): Promise<void> {
  const config = await load(root, values)
  if (!config) return

  const report = await sync({
    root: config.root,
    config,
    locales: localeList(values),
    dryRun: values['dry-run'] === true,
    force: values.force === true,
    // `--prune-manual` only ever removes stale entries, so it implies `--prune`.
    prune: values.prune === true || values['prune-manual'] === true,
    pruneManual: values['prune-manual'] === true,
    tm: values['no-tm'] !== true && values.tm !== false,
  })

  console.log(bold('source-i18n sync') + (report.dryRun ? dim(' (dry run)') : ''))
  console.log(dim(`  ${count(report.sources, 'string')} · ${count(report.files, 'file')}`))

  let failures = 0
  for (const locale of report.locales) {
    const parts: string[] = []
    if (locale.translated) parts.push(`${green(`+${locale.translated}`)} translated`)
    if (locale.fromMemory) parts.push(`${locale.fromMemory} from memory`)
    if (locale.pruned) parts.push(`${locale.pruned} pruned`)
    if (locale.missing) parts.push(red(`${locale.missing} missing`))
    if (locale.identical) parts.push(dim(`${locale.identical} unchanged`))

    const mark = locale.missing ? red('✖') : green('✓')
    console.log(`  ${mark} ${locale.locale.padEnd(8)} ${parts.join(' · ') || dim('nothing to do')}`)

    if (locale.issues.length > 0) {
      failures += locale.issues.length
      for (const issue of locale.issues.slice(0, 10)) {
        console.log(red(`      ${issue.kind}`) + dim(` "${issue.source}"`) + (issue.detail ? dim(` — ${issue.detail}`) : ''))
      }
      if (locale.issues.length > 10) {
        console.log(dim(`      ... and ${locale.issues.length - 10} more`))
      }
    }
  }

  if (report.plural.length > 0) {
    console.log(
      yellow(`  ${report.plural.length} string(s) have several numeric placeholders — no plural forms generated:`),
    )
    for (const item of report.plural.slice(0, 10)) {
      console.log(dim(`    "${item.source}"  (${item.placeholders.join(', ')}) — split into one-count sentences`))
    }
  }

  if (report.dynamic.length > 0) {
    console.log(yellow(`  ${report.dynamic.length} dynamic call(s) skipped`))
  }
  printSkipped(report.skipped)
  if (report.dryRun) {
    console.log(dim(`  about ${report.characters} characters would be sent for translation`))
  }

  const stillMissing = report.locales.reduce((total, locale) => total + locale.missing, 0)
  if (!report.dryRun && (failures > 0 || stillMissing > 0)) process.exitCode = 1
}

async function runFormat(root: string, values: Record<string, unknown>): Promise<void> {
  const config = await load(root, values)
  if (!config) return

  const report = formatProject({ root: config.root, config, check: values.check === true })
  console.log(bold('source-i18n format') + (values.check === true ? dim(' (check)') : ''))

  if (report.files.length === 0) {
    console.log(dim('  no catalogs yet'))
    return
  }

  for (const file of report.files) {
    const mark = file.changed ? yellow('✎') : green('✓')
    const detail = !file.changed ? 'ok' : file.renamedFrom ? `renamed from ${file.renamedFrom}` : 'normalized'
    console.log(`  ${mark} ${file.locale.padEnd(8)} ${detail}`)
  }

  if (values.check === true && report.changed > 0) {
    console.log(red(`  ${report.changed} file(s) need normalising`))
    process.exitCode = 1
  }
}

async function runCheck(root: string, values: Record<string, unknown>): Promise<void> {
  const config = await load(root, values)
  if (!config) return

  const report = checkProject({
    root: config.root,
    config,
    locales: localeList(values),
    strict: values.strict === true,
  })

  if (values.json === true) {
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.ok ? 0 : 1
    return
  }

  console.log(bold('source-i18n check') + dim(`  ${count(report.sources, 'string')}`))

  for (const locale of report.locales) {
    const clean = locale.missing.length === 0 && locale.invalid.length === 0
    const mark = clean ? green('✓') : red('✖')
    const details: string[] = []
    if (locale.missing.length) details.push(red(`${locale.missing.length} missing`))
    if (locale.invalid.length) details.push(red(`${locale.invalid.length} broken`))
    if (locale.identical.length) details.push(yellow(`${locale.identical.length} identical`))
    if (locale.unused.length) details.push(yellow(`${locale.unused.length} unused`))
    if (locale.manual.length) details.push(dim(`${locale.manual.length} manual`))

    console.log(`  ${mark} ${locale.locale.padEnd(8)} ${details.join(' · ') || dim('ok')}`)

    for (const item of locale.missing.slice(0, 20)) {
      console.log(dim(`      missing "${item.source}"  ${item.file}:${item.line}`))
    }
    for (const item of locale.invalid.slice(0, 20)) {
      console.log(red(`      ${item.kind} "${item.source}"`) + (item.detail ? dim(` — ${item.detail}`) : ''))
    }
    if (locale.missing.length > 20 || locale.invalid.length > 20) {
      console.log(dim('      ...'))
    }
  }

  if (report.short.length > 0) {
    console.log(yellow(`  ${report.short.length} short source string(s) — prefer a full sentence:`))
    for (const item of report.short.slice(0, 10)) {
      console.log(dim(`    "${item.source}"`))
    }
    if (report.short.length > 10) console.log(dim(`    ... and ${report.short.length - 10} more`))
  }

  if (report.plural.length > 0) {
    console.log(yellow(`  ${report.plural.length} string(s) have several numeric placeholders — no plural forms generated:`))
    for (const item of report.plural.slice(0, 10)) {
      console.log(dim(`    "${item.source}"  (${item.placeholders.join(', ')}) — split into one-count sentences`))
    }
  }

  if (report.dynamic.length > 0) {
    const label = `${report.dynamic.length} dynamic call(s) cannot be translated`
    if (report.strict) {
      console.log(red(`  ${label} — --strict treats this as an error:`))
      for (const entry of report.dynamic.slice(0, 20)) {
        console.log(dim(`    ${entry.file}:${entry.line}`))
      }
      if (report.dynamic.length > 20) console.log(dim(`    ... and ${report.dynamic.length - 20} more`))
    } else {
      console.log(yellow(`  ${label} (use --strict to fail on them)`))
    }
  }
  printSkipped(report.skipped)

  console.log(report.ok ? green('  all good') : red('  failed'))
  process.exitCode = report.ok ? 0 : 1
}

main().catch((error: unknown) => {
  console.error(red(`source-i18n: ${(error as Error).message}`))
  process.exitCode = 1
})
