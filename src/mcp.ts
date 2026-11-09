#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadConfig } from './node/config.js'
import { collectSources } from './node/sources.js'
import { checkProject } from './node/check.js'
import { readAllCatalogs } from './node/catalog-io.js'
import { sync } from './node/sync.js'

const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string }

const USAGE = `source-i18n-mcp — MCP server for source-i18n

Usage:
  source-i18n-mcp [--root <dir>]

Options:
  --root <dir>   project root (default: cwd)
  --help         show this help (written to stderr)

The server speaks MCP over stdio. Add it to Claude Desktop, Cursor, or any
MCP client, for example:

  {
    "mcpServers": {
      "source-i18n": {
        "command": "npx",
        "args": ["source-i18n-mcp", "--root", "/absolute/path/to/project"]
      }
    }
  }

Requires @modelcontextprotocol/sdk in the same project.`

function text(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      },
    ],
  }
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
}

const SECRET_KEY = /(api[-_]?key|secret|token|password|authorization)/i

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item, seen))
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    output[key] = SECRET_KEY.test(key) && item ? '[redacted]' : redact(item, seen)
  }
  return output
}

export async function createServer(options: { root?: string } = {}) {
  // Lazy imports keep `source-i18n-mcp --help` usable without the optional peers.
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
  const { z } = await import('zod')

  const root = path.resolve(options.root ?? process.cwd())
  const server = new McpServer({ name: 'source-i18n', version: pkg.version })

  const configFor = (configFile?: string) => loadConfig(root, configFile)

  server.registerTool(
    'i18n_extract',
    {
      title: 'Extract translatable strings',
      description:
        'Scan the project for t()/$t() calls and return source strings, files, and dynamic calls that cannot be extracted. Read-only.',
      inputSchema: {
        config: z.string().optional().describe('Explicit config file, relative to the project root'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe('Maximum number of sample strings to return (default 50)'),
      },
    },
    async ({ config: configFile, limit = 50 }) => {
      try {
        const config = await configFor(configFile)
        const index = collectSources(root, config)
        return text({
          root,
          sources: index.messages.size,
          files: index.files,
          dynamic: index.dynamic,
          skipped: index.skipped,
          sample: [...index.messages.values()].slice(0, limit),
        })
      } catch (error) {
        return failure(error)
      }
    },
  )

  server.registerTool(
    'i18n_check',
    {
      title: 'Check catalogs',
      description:
        'Validate translations for missing strings, broken placeholders/ICU, stale machine entries, and dynamic calls. Read-only; this is the CI gate.',
      inputSchema: {
        config: z.string().optional().describe('Explicit config file'),
        locale: z.string().optional().describe('Check one locale only'),
        strict: z
          .boolean()
          .optional()
          .describe('Fail on dynamic t() calls and stale machine entries (default false)'),
      },
    },
    async ({ config: configFile, locale, strict = false }) => {
      try {
        const config = await configFor(configFile)
        const report = checkProject({
          root,
          config,
          strict,
          locales: locale ? [locale] : undefined,
        })
        return text({
          ok: report.ok,
          strict: report.strict,
          sources: report.sources,
          files: report.files,
          dynamic: report.dynamic,
          locales: report.locales.map((item) => ({
            locale: item.locale,
            total: item.total,
            missing: item.missing.length,
            invalid: item.invalid.length,
            unused: item.unused.length,
            manual: item.manual.length,
            missingSample: item.missing.slice(0, 10),
            invalidSample: item.invalid.slice(0, 10),
          })),
        })
      } catch (error) {
        return failure(error)
      }
    },
  )

  server.registerTool(
    'i18n_sync',
    {
      title: 'Translate missing strings',
      description:
        'Fill missing translations and write catalogs. Dry-run by default. Set write=true only after the user explicitly approves, because it calls the configured provider and may cost money. Existing translations are never overwritten.',
      inputSchema: {
        config: z.string().optional().describe('Explicit config file'),
        locale: z.string().optional().describe('Sync one locale only'),
        write: z
          .boolean()
          .optional()
          .describe('Actually write catalogs (default false; dry-run only)'),
        force: z.boolean().optional().describe('Retranslate untouched machine output'),
        prune: z.boolean().optional().describe('Drop stale machine entries'),
        pruneManual: z.boolean().optional().describe('Also drop stale hand-added entries'),
        noTm: z.boolean().optional().describe('Do not reuse translations of renamed strings'),
      },
    },
    async ({
      config: configFile,
      locale,
      write = false,
      force = false,
      prune = false,
      pruneManual = false,
      noTm = false,
    }) => {
      try {
        const config = await configFor(configFile)
        const report = await sync({
          root,
          config,
          locales: locale ? [locale] : undefined,
          dryRun: !write,
          force,
          prune,
          pruneManual,
          tm: !noTm,
        })
        return text({
          dryRun: !write,
          sources: report.sources,
          files: report.files,
          locales: report.locales,
        })
      } catch (error) {
        return failure(error)
      }
    },
  )

  server.registerResource(
    'config',
    'source-i18n://config',
    {
      title: 'Resolved source-i18n config',
      description: 'Resolved configuration for the project. API keys are redacted.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const config = await configFor()
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(redact(config), null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.registerResource(
    'catalogs',
    'source-i18n://catalogs',
    {
      title: 'All translation catalogs',
      description: 'Every loaded locale catalog for the project.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const config = await configFor()
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(readAllCatalogs(config), null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.registerPrompt(
    'review-i18n',
    {
      title: 'Review i18n health',
      description: 'Check the project, summarize gaps, and propose fixes without editing files.',
      argsSchema: {
        locale: z.string().optional().describe('Limit the review to one locale'),
      },
    },
    ({ locale }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              'Review this project with the source-i18n MCP tools.',
              `Root: ${root}`,
              locale ? `Locale: ${locale}` : 'Locales: all configured',
              '',
              '1. Call i18n_check (strict: true) and summarize missing/invalid strings.',
              '2. Point out dynamic t() calls and explain how to rewrite them as literals with placeholders.',
              '3. Suggest a sync plan, but do not call i18n_sync with write=true.',
            ].join('\n'),
          },
        },
      ],
    }),
  )

  return server
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.error(USAGE)
    return
  }

  const rootIndex = args.indexOf('--root')
  const root = rootIndex >= 0 ? args[rootIndex + 1] : undefined
  if (rootIndex >= 0 && !root) {
    console.error('--root needs a directory')
    process.exitCode = 1
    return
  }

  const server = await createServer({ root })
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
  await server.connect(new StdioServerTransport())
}

/**
 * npm links bins through `node_modules/.bin` on POSIX, so `argv[1]` is the
 * symlink while `import.meta.url` is the real file. Compare real paths, or
 * `npx source-i18n-mcp` silently starts nothing.
 */
function isDirectRun(): boolean {
  const script = process.argv[1]
  if (!script) return false
  try {
    return realpathSync(script) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return pathToFileURL(script).href === import.meta.url
  }
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}

