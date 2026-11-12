<div align="center">

  <p>
    <a href="https://github.com/wreckglow/source-i18n/blob/main/README.md">English</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/zh-CN.md">简体中文</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/ja-JP.md"><strong>日本語</strong></a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/ko-KR.md">한국어</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/es-ES.md">Español</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/fr-FR.md">Français</a>
  </p>

  <img src="assets/logo.svg" width="64" height="64" alt="source-i18n" />

  <h1>source-i18n</h1>

  <p>
    <strong>フロントエンド向けの自動翻訳ツール。</strong><br />
    インターフェースを書き、すべての言語で届ける。
  </p>

  <p>
    <a href="https://www.npmjs.com/package/source-i18n"><img src="https://img.shields.io/npm/v/source-i18n?style=flat-square&color=e04a22" alt="npm" /></a>
    <img src="https://img.shields.io/badge/tests-209%20passing-2ea44f?style=flat-square" alt="tests" />
    <img src="https://img.shields.io/badge/node-%E2%89%A520-141412?style=flat-square" alt="node" />
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-141412?style=flat-square" alt="license" /></a>
  </p>

  <p>
    <a href="#クイックスタート">クイックスタート</a> &nbsp;·&nbsp;
    <a href="#機能">機能</a> &nbsp;·&nbsp;
    <a href="#ドキュメント">ドキュメント</a> &nbsp;·&nbsp;
    <a href="#ai">AI</a>
  </p>
</div>

<p align="center">
  <a href="https://sourcei18n.deploybrain.cn/ja/">サイト</a> &nbsp;·&nbsp;
  <a href="https://github.com/wreckglow/source-i18n">GitHub</a>
</p>

<img src="assets/hero.jpg" alt="source-i18n — インターフェースを書き、すべての言語で届ける" />

## これは何か

source-i18n はフロントエンドプロジェクト向けの自動翻訳ツールです。いつもどおり中国語や英語で画面を書き、ビルド時に英語・日本語・韓国語・スペイン語・フランス語などの言語版を自動生成します。文字列ごとのキーも、言語ファイルの管理も、書き出し表も不要です。

コーポレートサイト、管理画面、SaaS、Electron デスクトップアプリに。React、Vue、Svelte、素の HTML に対応。

## 考え方

翻訳キーは、チームがもう一つ維持しなければならない言語です。

`save_project_button_confirm` はコピーではありません。誰かが発明した名前で、十数のファイルに複製され、ユーザーが実際に読むテキストから永遠に切り離されています。

**source-i18n はキーという層を取り除きます。** ソーステキストがキーです。

```tsx
// 変更前
t('save_project_button_confirm')

// 変更後
t('Save project')
```

キーを発明する必要も、書き出すファイルもありません。1 つのソース文字列が、ビルド時に 5 つの翻訳になります。

| 書く | zh-CN | ja-JP | ko-KR | es-ES | fr-FR |
|---|---|---|---|---|---|
| `t('Save project')` | 保存项目 | プロジェクトを保存 | 프로젝트 저장 | Guardar proyecto | Enregistrer le projet |

ビルド時にすべての `t()` 呼び出しが抽出され、選んだプロバイダーで翻訳され、カタログとして注入されます。人手の編集は保持されます。不足している文字列は、ユーザーではなく CI を失敗させます。

## 機能

| 機能 | 得られるもの |
|---|---|
| **キー命名が不要** | 書いたテキストがそのまま識別子。発明も改名もドキュメント化も不要。 |
| **ビルド時抽出** | すべての `t()` / `$t()` 呼び出しが自動でカタログ項目になる。 |
| **プロバイダーの自由** | OpenAI 互換 API、DeepL、Ollama、手動、または独自の provider オブジェクト。 |
| **人手の編集が優先** | 機械出力はフィンガープリントされる。編集した訳文は `sync --force` でも上書きされない。 |
| **翻訳メモリ** | ソース文字列を改名しても、以前の訳文が付いてくる。 |
| **ICU 対応** | プレースホルダー、複数形、数値書式、曖昧な語のための `context`。 |
| **CI ゲート** | `check --strict` が欠落、壊れたプレースホルダー、古い項目、動的呼び出しを止める。 |
| **デフォルトで安全** | 本番バンドルにはカタログのみ。プロバイダーキーも開発エンドポイントもネットワーク要求もない。 |
| **5 つのバンドラー** | Vite、Rollup、esbuild、webpack、rspack。 |
| **5 つのランタイム** | React、Vue、Svelte、素の DOM、Node/Electron。 |
| **AI ネイティブ** | 内蔵 MCP サーバーと可搬な Agent Skill。特定のクライアントに依存しない。 |
| **6 言語のドキュメント** | ドキュメントサイト自体が source-i18n で作られている。 |

## 使った感触

```tsx
import { useT } from 'source-i18n/react'

export function Toolbar() {
  const t = useT()

  return (
    <button>{t('Save project')}</button>
  )
}
```

`source-i18n sync` 後のカタログ：

```json
{
  "locale": "zh-CN",
  "sourceLocale": "en-US",
  "messages": {
    "Save project": "保存项目"
  }
}
```

言語を切り替える：

```ts
import { setLocale } from 'source-i18n'

setLocale('zh-CN')
```

必要な API はこれだけです。

## クイックスタート

```bash
npm i source-i18n
npx source-i18n init
```

`init` は `source-i18n.config.mjs` と `i18n/locales/` を作成し、ソース言語・対象言語・プロバイダーを尋ねます。

設定ファイルは `.mjs`、`.js`、`.cjs`、`.json` のほか、**Node 22.13+** では `.ts` / `.mts` も使えます（Node が読み込み時に型を剥がすため、バンドラーも追加依存も不要）。Node 20 では `init` が生成する `.mjs` を使ってください。Node が TypeScript 設定を初めて読み込むときに `ExperimentalWarning` を 1 行表示しますが、無害です。

プラグインを追加：

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import sourceI18n from 'source-i18n/unplugin/vite'

export default defineConfig({
  plugins: [sourceI18n()],
})
```

バンドラーアダプターは ESM 専用です（unplugin 3 ベース）。ESM 設定から読み込んでください——`vite.config.ts`、`rollup.config.mjs`、`webpack.config.mjs`、または `"type": "module"` のパッケージ内の設定ファイル。CommonJS の `webpack.config.js` では関数形式の設定内で `await import('source-i18n/unplugin/webpack')` する必要があります。ランタイム自体はデュアルで、`source-i18n`、`/react`、`/vue`、`/svelte`、`/vanilla`、`/node` は `import` と `require` の両方で動作します。

書く：

```tsx
<button>{t('Save project')}</button>
```

実行：

```bash
npm run dev
```

不足している文字列は UI に表示され、コンソールにも報告されます。開発時の自動翻訳は**オプトイン**です。不足文字列をプロバイダーに送りたいときに `dev.autoTranslate` を有効にするか、次を実行します：

```bash
npx source-i18n sync
```

## お使いのスタックで

| ビルダー | UI | ランタイム |
|---|---|---|
| Vite | React 18 / 19 | ブラウザー |
| Rollup | Vue 3 | Node |
| esbuild | Svelte | Electron |
| webpack | 素の DOM | SSR |
| rspack | | |

ランタイムは小さく、フレームワークに馴染みます。React は hooks、Vue は composables、Svelte は store、素の HTML は `data-i18n`、CLI やデスクトップのメインプロセスには Node アダプター。

## プロバイダー

| プロバイダー | 向いている用途 |
|---|---|
| **OpenAI 互換** | 品質と速度：OpenAI、DeepSeek、Moonshot、Groq、OpenRouter、その他の互換エンドポイント。 |
| **DeepL** | ヨーロッパ言語や用語集の多い製品。 |
| **Ollama** | 完全ローカル翻訳。コピーがマシンの外に出ない。 |
| **手動** | 抽出と検証だけが欲しい。 |
| **カスタム** | 独自の翻訳サービスを `translate()` メソッド 1 つで。 |

キーは環境変数に置きます——`OPENAI_API_KEY`、`SOURCE_I18N_API_KEY`、`DEEPL_API_KEY`、`OLLAMA_HOST`。Node でのみ読み込まれ、ブラウザーには決して出ません。

## CLI

| コマンド | 内容 |
|---|---|
| `source-i18n init` | 設定とカタログディレクトリを作成する。 |
| `source-i18n extract` | 翻訳対象になるものを一覧表示する。読み取りのみ。 |
| `source-i18n sync` | 不足した翻訳を埋めてカタログを書き出す。 |
| `source-i18n sync --dry-run` | 何が起きるかだけ表示する。通信も書き込みもしない。 |
| `source-i18n format` | カタログを正規化する。毎コミット前に実行して安全。 |
| `source-i18n check --strict` | CI ゲート：欠落、不正、古い項目、動的呼び出し。 |
| `source-i18n skill --dir .claude/skills` | 可搬な Agent Skill をクライアントのディレクトリにインストールする。 |

`sync` は人手の編集を決して上書きしません。`--prune` はソースが消えた機械項目だけを削除し、`--prune-manual` は明示的なオプトインです。

## AI

このパッケージには、エージェントが実際に必要とするインターフェースが入っています。

**MCP サーバー**

```bash
npm i -D source-i18n @modelcontextprotocol/sdk
npx source-i18n-mcp --root /path/to/project
```

ツール：`i18n_extract`、`i18n_check`、`i18n_sync`。`sync` はデフォルトで dry-run で、明示的な確認があるときだけ書き込みます。リソースは秘匿化された設定とカタログを公開します。

**Agent Skill（可搬）**

```bash
npx source-i18n skill --dir <your-client-skills-dir>
```

Skill は Agent Skills オープン標準に従い、Claude Code に縛られません。`.claude/skills/` はあくまで 1 クライアントのインストール先で、他の Agent Skills クライアントは自分の skills パスから同じフォルダーを読み込みます。既存のインストールを上書きするには `--force` を使います。

## セキュリティ

- プロバイダーキーは Node に留まる。ブラウザーバンドルにはカタログだけ。
- 本番ビルドには開発エンドポイントも開発トークンもない。
- 開発エンドポイントはセッションごとのトークン、同一オリジン、JSON を要求する。
- MCP は `apiKey`、`token`、`secret`、`password` フィールドを秘匿化する。
- `npm publish` は公開対象の全ファイルをシークレットスキャンする。

## ドキュメント

**サイト：** [sourcei18n.deploybrain.cn/ja/](https://sourcei18n.deploybrain.cn/ja/)

<img src="assets/docs.jpg" alt="source-i18n ドキュメントサイト" />

ドキュメントは別サイトで管理されています。セットアップ、概念、API、CLI、設定、CI、プロバイダー、例、トラブルシューティング、AI ツールを扱う 15 ページです。

6 言語——English、中文、日本語、한국어、Español、Français——で、検索、ページ内目次、ロケール接頭辞付き URL を備えています。

## トレードオフ

source-i18n は意見を持っています。次のような場合に向いています：

- チームが製品内に直接コピーを書く；
- 翻訳を別ポータルではなくビルドの一部にしたい；
- キー登録表の維持より出荷を優先する。

向かないのは、実行時のユーザー生成コンテンツ、バックエンドのエラー文字列、翻訳者ロールや承認フローを備えた本格的な TMS が必要なワークフローです。

ソース文字列を変更すると新しいカタログ項目ができます。これがソース・アズ・キーのコストであり、翻訳メモリが存在する理由です。

## ステータス

- 実際のバンドラーと実ブラウザーを含む `209` テスト
- Node.js `>= 20`
- MIT ライセンス
- パッケージ：[`source-i18n`](https://www.npmjs.com/package/source-i18n)
- ソースと issue：[`wreckglow/source-i18n`](https://github.com/wreckglow/source-i18n)
- 連絡先：[wreckglow@gmail.com](mailto:wreckglow@gmail.com)

## 免責事項

source-i18n は「現状のまま」提供され、いかなる保証も伴いません。詳しくは [LICENSE](./LICENSE) を参照してください。

- 機械翻訳はサードパーティのプロバイダーによるもので、誤りを含む可能性があります。出荷前にカタログをレビューしてください。メンテナーは翻訳の誤り、欠落、およびその結果について責任を負いません。
- 翻訳するよう選んだソース文字列は、設定したプロバイダー（OpenAI 互換エンドポイント、DeepL、Ollama、独自 provider、または MCP クライアントの背後のモデル）に送信されます。そのデータと API 費用は、あなたとプロバイダーの間のものです。
- 医療、法律、安全、金融、規制対象など、誤った表現が害を及ぼしうる場面では、人手のレビューなしに機械翻訳に依存しないでください。

## ライセンス

MIT © source-i18n contributors

<br />

<div align="center">
  <sub>インターフェースを書き、すべての言語で届ける。</sub>
</div>
