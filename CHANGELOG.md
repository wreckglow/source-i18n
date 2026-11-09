# Changelog

## 0.1.0

First release.

- Source text is the key: `t('保存项目')`, no manual key naming.
- Build-time extraction through unplugin (Vite, Rollup, webpack, esbuild).
- Virtual module registers catalogs before application modules run.
- Dev server translates missing strings and writes them back to the catalogs.
- Missing translations log a console warning in dev (even when auto-translation
  is off), so fallbacks no longer hide gaps. Dynamic `t()` calls are warned
  about once per location at compile time and fail `check --strict`.
- Strict mode needs no ignore lists: identical translations are advisory, and
  only a machine translation that nobody edited and whose source disappeared
  counts as unused. `sync --prune` uses the same rule, so hand-added fragments
  and human edits are never deleted.
- Build gate: `check: { onBuild: 'error' | 'warn' }` runs `check --strict` at the
  start of a production build, so `vite build` itself fails on missing/broken
  translations without an extra npm script. Webpack/Rspack report it as a normal
  compilation error; Vite/Rollup fail through the plugin context.
- The plugin now adopts the bundler root (Vite `config.root`, webpack/rspack
  `context`) when no explicit `root` option is passed.
- Plural placeholders are configuration (`plural.placeholders`, default
  `["count"]`) instead of a hard-coded list of variable names, so `{inputs}` and
  `{lines}` can drive plural forms. Sentences with more than one such
  placeholder are reported (no ICU plural is generated).
- Identical translations that are clearly broken (a Chinese/Japanese/Korean
  sentence copied into a non-CJK catalog) now fail; brand names stay advisory.
- `check` reports short source keys (≤3 characters, CJK, no placeholder),
  manual entries whose source disappeared, and multi-count sentences. None of
  them fail; `sync --prune-manual` can remove the manual ones on request.
- `extract.requireImport: false` scans wrapper modules that call `t()` without
  importing the runtime.
- All package-owned text is English now (examples, prompt, comments). CLI
  output can escape CJK source strings with `--ascii` or
  `SOURCE_I18N_ASCII=1`, so a non-UTF-8 Windows console never prints mojibake.
- Extraction scans `${...}` inside template literals, so `t()` calls inside
  HTML template strings are no longer missed.
- Extraction also understands conditional branches (`t(flag ? 'A' : 'B')`),
  nullish/logical fallbacks (`t(name ?? '未命名')`) and fully literal
  concatenation (`t('a' + 'b')`); mixed concatenation stays dynamic.
- Providers: OpenAI-compatible endpoints, DeepL, Ollama, manual, custom.
- Translation validation (placeholders, ICU syntax) with one retry.
- Human edits are fingerprinted and never overwritten by `--force`.
- Translation memory for renamed source strings.
- CLI: `init`, `extract`, `sync`, `format`, `check`
  (with `--dry-run`, `--force`, `--prune`, `--strict`, `--json`, `--check`).
- Locale handling: browser detection, persisted choice, regional matching,
  canonical BCP-47 tags (`zh_cn` → `zh-CN`).
- Hardening: BOM/CRLF tolerant catalogs, path-safe locale tags, `providerTimeout`
  (default 60s), segment-based file excludes, optional/generic `t` calls,
  concatenated sources reported as dynamic, fuzz-tested scanner and formatter,
  non-UTF-8 (e.g. GBK) source files skipped and reported.
- Resilience: atomic writes clean up their temp file on failure, long paths and
  `app.asar` paths work, junction loops are ignored, and a second dev server on
  the same project cannot silently drop translations.
- Cross-process file lock so two dev servers (or a dev server and `sync`) never
  lose each other's translations.
- The virtual module is invalidated after a dev write-back, so a page reload
  shows the new translation instead of a stale 304 response.
- The formatter is diff-tested against FormatJS on the supported ICU subset
  (25/26 identical; the one difference is FormatJS's 2-digit short year for zh-CN).
- Rspack support verified end to end. Bundlers that drop side-effect-only
  imports now keep the catalog module because the injected import exports a used
  function (`__keylessInit`), and the virtual entry has a real placeholder file.
- Webpack support verified end to end: a real build bundles catalogs, strips the
  dev endpoint, and the virtual module is marked side-effectful so
  `"sideEffects": false` projects cannot tree-shake it away. `KeylessPlugin` is
  now a real class (`new KeylessPlugin()`); webpack gets a bare virtual id while
  Vite/Rollup/esbuild keep `virtual:`.
- Audit fixes: plural detection now works when other placeholders share the
  sentence; stale locks are recovered (2s stale / 6s timeout); two files that
  normalise to the same locale are rejected instead of silently merged; BOM in
  `.meta.json` is handled; 429/5xx provider responses retry with backoff.
- Prompt rework: stricter output contract, punctuation/placeholder rules, and
  plural handling through per-category slots assembled by the library
  (with no plural forms for zh/ja/ko/th/vi targets).
- Adapters: React, Vue, Svelte, plain DOM, Node/Electron.
- ICU-lite formatter: placeholders, plural, select, number, date, apostrophe quoting.
