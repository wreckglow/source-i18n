# CLI reference

All commands accept `--root <dir>` (default cwd) and `--config <file>`.
`--locale <tag>` limits a command to one locale and can be repeated.

## init

```bash
npx source-i18n init
npx source-i18n init --yes --source zh-CN --locales en-US,ja-JP --provider openai
```

Creates `source-i18n.config.mjs` and `i18n/locales/`. Interactive unless `--yes`.

## extract

```bash
npx source-i18n extract
```

Lists extracted strings, files, and dynamic `t()` calls. Read-only.

## sync

```bash
npx source-i18n sync
npx source-i18n sync --dry-run
npx source-i18n sync --force
npx source-i18n sync --prune
npx source-i18n sync --prune --prune-manual
npx source-i18n sync --no-tm
npx source-i18n sync --locale ja-JP
```

- Fills missing entries; never overwrites human edits.
- `--force`: retranslate untouched machine output.
- `--prune`: drop stale machine entries whose source disappeared.
- `--prune-manual`: also drop hand-added entries (destructive; opt-in).
- `--no-tm`: do not reuse translations of renamed strings.
- `--dry-run`: no network, no writes.

Exit code is 1 when the provider or validation fails.

## format

```bash
npx source-i18n format
npx source-i18n format --check
```

Sorts keys, canonicalizes locale tags, drops junk, ends files with a newline.
`--check` exits 1 when files need normalizing.

## check

```bash
npx source-i18n check
npx source-i18n check --strict
npx source-i18n check --json
npx source-i18n check --ascii
```

Reports missing strings, invalid placeholders/ICU, identical CJK-to-Latin
entries, unused machine entries, hand-added entries, and dynamic calls.
`--strict` makes dynamic calls and stale machine entries fail. Exit code 1 on
failure. `--ascii` escapes non-ASCII output as `\uXXXX`.
