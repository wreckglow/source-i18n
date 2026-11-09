import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { messageKey } from '../catalog.js'
import { readAllCatalogs, readCatalog, writeCatalog } from '../node/catalog-io.js'
import { loadConfig } from '../node/config.js'
import { withFileLock } from '../node/files.js'
import { extractMessages, importsKeyless } from '../node/extract.js'
import { createProvider } from '../node/providers/index.js'
import { validateTranslation } from '../node/validate.js'
import type { Provider, ResolvedConfig } from '../types.js'

export interface Options {
  /** Project root. Defaults to the bundler's working directory. */
  root?: string
  /** Explicit config file. */
  config?: string
  /** Translate missing strings while the dev server runs. Default false. */
  autoTranslate?: boolean
  /** Persist dev translations to the catalog files. Default true. */
  writeBack?: boolean
  /** Bundler name from unplugin (`vite`, `webpack`, ...). Set by the adapter. */
  framework?: string
  /**
   * Advanced: reuse an existing engine instead of creating one.
   * Needed when you host the dev middleware yourself (custom dev servers,
   * integration tests) and must share the same per-session token.
   */
  engine?: Engine
}

// Vite/Rollup/esbuild resolve `virtual:` ids through resolveId. Webpack treats
// unknown schemes as URIs and fails before resolveId runs, so it gets a bare
// specifier instead (also kept out of the package exports map on purpose).
export const VIRTUAL_ID = 'virtual:source-i18n/messages'
export const WEBPACK_VIRTUAL_ID = 'source-i18n/virtual-messages'
export const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID
export const RESOLVED_WEBPACK_ID = '\0' + WEBPACK_VIRTUAL_ID

const SOURCE_RE = /\.(?:[cm]?[jt]sx?|vue|svelte)$/
const ENDPOINT = '/__source-i18n/translate'

interface MiddlewareStack {
  use(
    fn: (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void,
  ): void
}

/**
 * Shared implementation behind every bundler adapter.
 *
 * - extracts `t('...')` calls while modules are transformed
 * - serves the catalogs through a virtual module
 * - in dev, translates strings that are missing and writes them back
 */
export class Engine {
  private configPromise?: Promise<ResolvedConfig>
  private config?: ResolvedConfig
  private sources = new Map<string, { id: string; source: string; context?: string }>()
  private dynamic = new Set<string>()
  private providerInstance?: Provider
  private isDev = process.env.NODE_ENV !== 'production'
  private warned = false
  private warnedAutoTranslate = false
  private warnedEncoding = new Set<string>()
  private warnedDynamic = new Set<string>()
  private onCatalogsChanged?: () => void
  /**
   * Per-process secret required by the dev endpoint. It is embedded in the
   * virtual module (which only the app served by this dev server can read),
   * so a random website or another local process cannot spend API credits.
   */
  private readonly secret = randomBytes(24).toString('hex')

  constructor(private readonly options: Options = {}) {}

  get devToken(): string {
    return this.secret
  }

  init(): Promise<ResolvedConfig> {
    if (!this.configPromise) {
      const root = this.options.root ?? process.cwd()
      this.configPromise = loadConfig(root, this.options.config).then((config) => {
        this.config = config
        return config
      })
    }
    return this.configPromise
  }

  setDev(value: boolean): void {
    this.isDev = value
  }

  /**
   * Adopt the bundler's project root when the user did not pass one. Vite can
   * be started with `--root app`, webpack has `context`; without this the plugin
   * would look for source-i18n.config.mjs next to the process instead of the app.
   */
  setRoot(root: string): void {
    if (this.options.root || !root) return
    this.options.root = root
    this.configPromise = undefined
    this.config = undefined
  }

  /**
   * Called after the dev server writes a catalog. Bundler adapters use it to
   * invalidate the virtual module, otherwise a page reload would keep serving
   * the stale module (etag 304) and show untranslated strings again.
   */
  setCatalogsChangedHandler(handler: () => void): void {
    this.onCatalogsChanged = handler
  }

  get cache(): { sources: number; dynamic: number; locales: number } {
    return {
      sources: this.sources.size,
      dynamic: this.dynamic.size,
      locales: this.config ? this.config.locales.length : 0,
    }
  }

  /**
   * Optional build gate: `check.onBuild` in the config makes a production build
   * fail (or warn) when translations are missing or broken, so CI that runs the
   * build is a real gate without an extra npm script.
   */
  async buildGate(): Promise<string | undefined> {
    if (this.isDev) return undefined
    const config = await this.init()
    const mode = config.check.onBuild
    if (mode === 'off') return undefined

    const { checkProject } = await import('../node/check.js')
    const report = checkProject({ root: config.root, config, strict: config.check.strict })
    if (report.ok) return undefined

    const missing = report.locales.reduce((total, locale) => total + locale.missing.length, 0)
    const invalid = report.locales.reduce((total, locale) => total + locale.invalid.length, 0)
    const stale = report.locales.reduce((total, locale) => total + locale.unused.length, 0)
    const parts: string[] = []
    if (missing) parts.push(`${missing} missing`)
    if (invalid) parts.push(`${invalid} broken`)
    if (stale) parts.push(`${stale} stale`)
    if (report.dynamic.length) parts.push(`${report.dynamic.length} dynamic`)

    const message =
      `[source-i18n] check failed: ${parts.join(', ') || 'see the report'}. ` +
      'Run "npx source-i18n check --strict" for details.'

    if (mode === 'warn') {
      console.warn(message)
      return undefined
    }
    // The bundler adapter turns this into a compilation error; throwing here
    // would escape webpack's hook as an uncaught process error.
    return message
  }

  async transform(code: string, id: string): Promise<string | null> {
    const clean = id.split('?')[0] ?? id
    if (!SOURCE_RE.test(clean)) return null
    if (clean.includes('node_modules')) return null
    if (id.startsWith('\0') || id.includes('virtual:')) return null

    if (code.includes('\uFFFD')) {
      if (!this.warnedEncoding.has(clean)) {
        this.warnedEncoding.add(clean)
        console.warn(
          `[source-i18n] skipped ${path.relative(this.config?.root ?? process.cwd(), clean)}: not valid UTF-8`,
        )
      }
      return null
    }

    if (!importsKeyless(code)) return null
    // Only ever touch JavaScript. A raw SFC belongs to the framework compiler.
    if ((clean.endsWith('.vue') || clean.endsWith('.svelte')) && code.trimStart().startsWith('<')) return null
    if (!/\bimport\s+[\w{*"']/.test(code)) return null

    const config = await this.init()
    const file = path.relative(config.root, clean).split(path.sep).join('/')
    const result = extractMessages(code, { file, functions: config.extract.functions, force: true })

    for (const message of result.messages) {
      if (!this.sources.has(message.id)) this.sources.set(message.id, message)
    }
    for (const entry of result.dynamic) {
      const key = `${entry.file}:${entry.line}`
      this.dynamic.add(key)
      // Surface it immediately: a dynamic call can never be translated and is
      // invisible until someone runs `check`.
      if (!this.warnedDynamic.has(key)) {
        this.warnedDynamic.add(key)
        console.warn(
          `[source-i18n] dynamic t() call at ${entry.file}:${entry.line} cannot be translated — use a literal string`,
        )
      }
    }

    // Appending instead of prepending keeps the original line numbers intact,
    // which keeps source maps and stack traces accurate.
    // Webpack always needs the bare id. Rspack also gets it: its resolver runs
    // package exports before plugin resolveId hooks, so the bare specifier falls
    // back to the real `virtual-messages.js` entry, which `load` replaces.
    const specifier =
      this.options.framework === 'webpack' || this.options.framework === 'rspack'
        ? WEBPACK_VIRTUAL_ID
        : VIRTUAL_ID
    if (process.env.SOURCE_I18N_DEBUG) {
      console.error('[source-i18n] transform', file, '->', specifier)
    }
    // A bare side-effect import is dropped by bundlers when the package (or a
    // path inside it) is marked side-effect-free. Using an exported function
    // keeps the module in the graph; its registration still runs at module
    // evaluation time, i.e. before this module's body.
    return `${code}\nimport { __keylessInit } from ${JSON.stringify(specifier)};\n__keylessInit();\n`
  }

  resolveId(id: string): string | undefined {
    if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID
    if (id === WEBPACK_VIRTUAL_ID) return RESOLVED_WEBPACK_ID
    return undefined
  }

  async load(id: string): Promise<string | undefined> {
    if (process.env.SOURCE_I18N_DEBUG) console.error('[source-i18n] load', JSON.stringify(id))
    const isPlaceholder = /[\\/]virtual-messages\.(?:js|cjs|mjs)$/.test(id)
    if (id !== RESOLVED_VIRTUAL_ID && id !== RESOLVED_WEBPACK_ID && !isPlaceholder) return undefined
    const config = await this.init()
    const module = this.generateModule(config)
    if (process.env.SOURCE_I18N_DEBUG) {
      console.error('[source-i18n] module length', module.length, 'has catalog', module.includes('Save Project'))
    }
    return module
  }

  private generateModule(config: ResolvedConfig): string {
    const catalogs = readAllCatalogs(config)
    const dev = this.isDev
    const autoTranslate = dev && config.dev.autoTranslate === true

    if (autoTranslate && !this.warnedAutoTranslate) {
      this.warnedAutoTranslate = true
      const provider = config.provider
      const name = typeof provider === 'string' ? provider : provider?.name
      if (name && name !== 'manual' && name !== 'ollama') {
        console.warn(
          `[source-i18n] dev auto-translate is ON: missing strings are sent to provider "${name}". ` +
            'Set dev.autoTranslate:false or provider:"manual" to keep copy local.',
        )
      }
    }

    const imports = ['registerCatalogs']
    if (dev) imports.push('setWarnOnMissing')
    if (autoTranslate) imports.push('setMissingHandler')

    const lines = [
      `import { ${imports.join(', ')} } from "source-i18n";`,
      `const catalogs = ${JSON.stringify(catalogs)};`,
      `registerCatalogs(catalogs, { sourceLocale: ${JSON.stringify(config.source)} });`,
    ]

    // Warn about missing strings in dev even when auto-translation is off.
    if (dev) {
      lines.push('if (typeof window !== "undefined") setWarnOnMissing(true);')
    }

    if (autoTranslate) {
      lines.push(`const targets = ${JSON.stringify(config.locales)};
const devToken = ${JSON.stringify(this.secret)};
if (typeof window !== "undefined") {
  setMissingHandler(({ source, context, locale }) => {
    if (!targets.includes(locale)) return undefined;
    return fetch(${JSON.stringify(ENDPOINT)}, {
      method: "POST",
      headers: { "content-type": "application/json", "x-source-i18n-token": devToken },
      body: JSON.stringify({ source, context, locale })
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => (data && typeof data.text === "string" ? data.text : undefined))
      .catch(() => undefined);
  });
}`)
    }

    // Exported so the injected import is a used binding and cannot be
    // tree-shaken away. Registration itself happens above, at module evaluation.
    lines.push('export function __keylessInit() {}', 'export default catalogs;', '')
    return lines.join('\n')
  }

  attachMiddleware(stack: MiddlewareStack): void {
    stack.use((req, res, next) => {
      const url = req.url ?? ''
      if (!url.startsWith(ENDPOINT)) {
        next()
        return
      }
      void this.handleTranslate(req, res)
    })
  }

  private async handleTranslate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.method !== 'POST') {
        send(res, 405, { error: 'method not allowed' })
        return
      }
      if (!isSameOriginRequest(req)) {
        send(res, 403, { error: 'cross-origin requests are not allowed' })
        return
      }
      if (!this.hasValidToken(req)) {
        send(res, 403, { error: 'missing or invalid dev token' })
        return
      }
      if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
        send(res, 415, { error: 'expected application/json' })
        return
      }

      const body = (await readJson(req)) as {
        source?: unknown
        context?: unknown
        locale?: unknown
      }
      if (typeof body.source !== 'string' || !body.source) {
        send(res, 400, { error: 'source is required' })
        return
      }

      const config = await this.init()
      if (!config.dev.autoTranslate) {
        send(res, 403, { error: 'auto translate is disabled' })
        return
      }

      const locale =
        typeof body.locale === 'string' && config.locales.includes(body.locale)
          ? body.locale
          : config.locales[0]!

      const context = typeof body.context === 'string' ? body.context : undefined
      const id = messageKey(body.source, context)
      const provider = this.provider(config)

      const result = await provider.translate({
        items: [{ id, text: body.source, context }],
        from: config.source,
        to: locale,
        glossary: config.glossary,
      })

      const text = result[id]
      if (!text) {
        send(res, 502, { error: 'the provider returned no translation' })
        return
      }

      const issue = validateTranslation(body.source, text)
      if (issue?.blocking) {
        send(res, 422, { error: `${issue.kind}: ${issue.detail ?? ''}`.trim() })
        return
      }

      if (config.dev.writeBack !== false) {
        const file = path.join(config.root, config.catalogs, `${locale}.json`)
        const written = withFileLock(file, () => {
          const catalog = readCatalog(file, locale)
          if (catalog[id] === text) return false
          catalog[id] = text
          writeCatalog(file, locale, config.source, catalog)
          return true
        })
        if (written) this.onCatalogsChanged?.()
      }

      send(res, 200, { id, text })
    } catch (error) {
      const message = (error as Error).message
      if (!this.warned) {
        this.warned = true
        console.warn(`[source-i18n] dev translation failed: ${message}`)
      }
      send(res, 500, { error: message })
    }
  }

  private provider(config: ResolvedConfig): Provider {
    if (!this.providerInstance) this.providerInstance = createProvider(config)
    return this.providerInstance
  }

  private hasValidToken(req: IncomingMessage): boolean {
    const header = req.headers['x-source-i18n-token']
    const provided = Array.isArray(header) ? header[0] : header
    if (typeof provided !== 'string' || provided.length === 0) return false
    const actual = Buffer.from(provided)
    const expected = Buffer.from(this.secret)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
}

/** DNS-rebinding / CSRF guard for the dev endpoint. */
function isSameOriginRequest(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'same-site' && site !== 'none') {
    return false
  }

  const origin = req.headers.origin
  if (typeof origin === 'string' && origin) {
    const host = req.headers.host
    try {
      if (!host || new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }

  return true
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8')
      if (data.length > 1_000_000) reject(new Error('request body too large'))
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded) return
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}
