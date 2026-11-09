# Configuration reference

Config files are discovered in this order at the project root:

`source-i18n.config.ts`, `.mts`, `.mjs`, `.js`, `.cjs`, `.json`, then
`i18n.config.ts`, `.mts`, `.mjs`, `.json`.

Minimal config:

```js
import { defineConfig } from 'source-i18n'

export default defineConfig({
  source: 'zh-CN',
  locales: ['en-US'],
})
```

| Field | Type | Default | Meaning |
|---|---|---|---|
| `source` | string | — (required) | Language the source strings are written in |
| `locales` | string[] | — (required) | Target locales |
| `catalogs` | string | `i18n/locales` | Catalog directory, relative to root |
| `provider` | string \| object | `openai` | `openai`, `deepl`, `ollama`, `manual`, or a custom object |
| `glossary` | Record<string,string> | `{}` | Terms that must not be translated |
| `providerTimeout` | number | `60000` | Abort a provider request after this many ms |
| `provenance` | boolean | `true` | Track machine vs human translations |
| `plural.placeholders` | string[] | `['count']` | Numeric placeholder names that drive ICU plurals |
| `extract.include` | string[] | common dirs | Directories to scan |
| `extract.exclude` | string[] | common dirs | Substrings that skip a file |
| `extract.functions` | string[] | `['t', '$t']` | Call names to extract |
| `extract.requireImport` | boolean | `true` | Only scan files that import the runtime |
| `dev.autoTranslate` | boolean | `false` | Opt-in: send missing strings to the provider during dev |
| `dev.writeBack` | boolean | `true` | Persist dev translations to catalogs |
| `check.onBuild` | `'off' \| 'warn' \| 'error'` | `'off'` | Run the gate during production builds |
| `check.strict` | boolean | `true` | Strict rules for the build gate |

Provider examples:

```js
provider: {
  name: 'openai',
  baseURL: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY,
}
```

```js
provider: 'deepl' // DEEPL_API_KEY
provider: { name: 'ollama', model: 'qwen2.5:7b' } // OLLAMA_HOST
provider: 'manual' // extract only; you fill catalogs
```

Environment variables: `OPENAI_API_KEY` / `SOURCE_I18N_API_KEY`,
`SOURCE_I18N_BASE_URL`, `SOURCE_I18N_MODEL`, `DEEPL_API_KEY`, `OLLAMA_HOST`.
