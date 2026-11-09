# Troubleshooting catalogue

## no config file found

Run from the project root, or pass `--root`. Supported names are
`source-i18n.config.{ts,mts,mjs,js,cjs,json}` and `i18n.config.{ts,mts,mjs,json}`.

## Page keeps showing source text

1. The file may not import `source-i18n`; extraction skips it by default.
2. The plugin may be added only to the dev server. Add it to production too.
3. The catalog may not contain the string. Run `npx source-i18n check`.
4. The current locale may not match any loaded catalog.

## dynamic t() call

The extractor cannot know a runtime value. Replace:

```ts
t(label)
t(`Exported ${count} files`)
```

with:

```ts
t('Exported {count} files', { count })
```

## Placeholder or ICU errors

A hand edit removed `{name}` or broke plural syntax. Restore the placeholder and
run `check`. The library generates ICU plural syntax; do not write it by hand in
source strings.

## 401 / 403

The provider key is missing, wrong, or lacks access. DeepL free keys end with
`:fx`. Put keys in environment variables and restart the dev server.

## 429 / timeout

Rate limited, unstable network, or a slow model. Retry later, lower the batch
size, raise `providerTimeout`, or switch to a local Ollama model.

## TypeScript config requires Node 22.13+

Either upgrade Node or rename the config to `source-i18n.config.mjs`.

## Language switch does not re-render

The component must use `useT()` / `useLocale()` (React), `useT()` (Vue), or the
`translator()` store (Svelte). Check that the locale is listed in `locales`.

## Windows console mojibake

Add `--ascii` or set `SOURCE_I18N_ASCII=1` to print CJK as `\uXXXX`.

## Production bundle has no catalogs

The plugin was only added to the dev server, or the injected import was removed.
Use the plugin in the production build and search the bundle for one translation
to confirm.
