<div align="center">

  <p>
    <a href="https://github.com/wreckglow/source-i18n/blob/main/README.md">English</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/zh-CN.md">简体中文</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/ja-JP.md">日本語</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/ko-KR.md">한국어</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/es-ES.md">Español</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/fr-FR.md"><strong>Français</strong></a>
  </p>

  <img src="assets/logo.svg" width="64" height="64" alt="source-i18n" />

  <h1>source-i18n</h1>

  <p>
    <strong>Traduction automatique pour projets frontend.</strong><br />
    Écrivez l'interface. Publiez dans toutes les langues.
  </p>

  <p>
    <a href="https://www.npmjs.com/package/source-i18n"><img src="https://img.shields.io/npm/v/source-i18n?style=flat-square&color=e04a22" alt="npm" /></a>
    <img src="https://img.shields.io/badge/tests-209%20passing-2ea44f?style=flat-square" alt="tests" />
    <img src="https://img.shields.io/badge/node-%E2%89%A520-141412?style=flat-square" alt="node" />
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-141412?style=flat-square" alt="license" /></a>
  </p>

  <p>
    <a href="#démarrage-rapide">Démarrage rapide</a> &nbsp;·&nbsp;
    <a href="#fonctionnalités">Fonctionnalités</a> &nbsp;·&nbsp;
    <a href="#documentation">Documentation</a> &nbsp;·&nbsp;
    <a href="#ia">IA</a>
  </p>
</div>

<img src="assets/hero.jpg" alt="source-i18n — écrivez l'interface, publiez dans toutes les langues" />

## Qu'est-ce que c'est

source-i18n est un outil de traduction automatique pour les projets frontend.
Écrivez l'interface en chinois ou en anglais comme d'habitude ; le build génère les
versions anglaise, japonaise, coréenne, espagnole, française et d'autres langues.
Pas de clé pour chaque phrase, pas de fichiers de langue à maintenir, pas de
feuille d'export.

Pour les sites vitrines, les back-offices, les SaaS et les applications de bureau
Electron ; compatible React, Vue, Svelte et HTML natif.

## L'idée

Les clés de traduction sont une seconde langue que votre équipe doit maintenir.

`save_project_button_confirm` n'est pas le texte. C'est un nom inventé par quelqu'un, répété dans une douzaine de fichiers, et à jamais séparé du texte que l'utilisateur lit réellement.

**source-i18n supprime la couche de clés.** Le texte source est la clé.

```tsx
// avant
t('save_project_button_confirm')

// après
t('Save project')
```

Aucune clé à inventer, aucun fichier à exporter. Une chaîne source devient cinq traductions au build :

| Vous écrivez | zh-CN | ja-JP | ko-KR | es-ES | fr-FR |
|---|---|---|---|---|---|
| `t('Save project')` | 保存项目 | プロジェクトを保存 | 프로젝트 저장 | Guardar proyecto | Enregistrer le projet |

Au moment du build, chaque appel `t()` est extrait, traduit par le fournisseur choisi et injecté sous forme de catalogue. Les modifications humaines sont conservées. Les chaînes manquantes font échouer la CI, pas vos utilisateurs.

## Fonctionnalités

| Capacité | Ce que vous obtenez |
|---|---|
| **Aucun nom de clé** | Le texte que vous écrivez est l'identifiant. Rien à inventer, renommer ou documenter. |
| **Extraction au build** | Chaque appel `t()` / `$t()` devient automatiquement une entrée de catalogue. |
| **Liberté de fournisseur** | API compatibles OpenAI, DeepL, Ollama, mode manuel ou votre propre objet provider. |
| **Les modifications humaines gagnent** | La sortie machine est empreintée. Une fois une traduction modifiée, `sync --force` ne l'écrase plus. |
| **Mémoire de traduction** | Renommez une chaîne source, l'ancienne traduction suit. |
| **Prêt pour ICU** | Placeholders, pluriels, formatage des nombres et `context` pour les mots ambigus. |
| **Garde CI** | `check --strict` bloque les chaînes manquantes, les placeholders cassés, les entrées obsolètes et les appels dynamiques. |
| **Sûr par défaut** | Les bundles de production ne contiennent que les catalogues : pas de clés de fournisseur, pas d'endpoint de dev, pas de requêtes réseau. |
| **Cinq bundlers** | Vite, Rollup, esbuild, webpack et rspack. |
| **Cinq environnements** | React, Vue, Svelte, DOM natif et Node/Electron. |
| **Natif pour l'IA** | Serveur MCP intégré et Agent Skill portable, sans dépendance à un client. |
| **Documentation en six langues** | Le site de documentation est construit avec source-i18n. |

## Ce que ça donne

```tsx
import { useT } from 'source-i18n/react'

export function Toolbar() {
  const t = useT()

  return (
    <button>{t('Save project')}</button>
  )
}
```

Votre catalogue après `source-i18n sync` :

```json
{
  "locale": "zh-CN",
  "sourceLocale": "en-US",
  "messages": {
    "Save project": "保存项目"
  }
}
```

Changer de langue :

```ts
import { setLocale } from 'source-i18n'

setLocale('zh-CN')
```

C'est toute l'API dont vous avez besoin.

## Démarrage rapide

```bash
npm i source-i18n
npx source-i18n init
```

`init` crée `source-i18n.config.mjs` et `i18n/locales/`, puis demande votre langue source, les langues cibles et le fournisseur.

Le fichier de configuration peut être `.mjs`, `.js`, `.cjs` ou `.json` — ou `.ts` / `.mts` sur **Node 22.13+**, où Node retire les types au chargement (sans bundler, sans dépendance supplémentaire). Sur Node 20, utilisez le `.mjs` créé par `init`. Node affiche un `ExperimentalWarning` d'une ligne la première fois qu'il charge une configuration TypeScript ; c'est inoffensif.

Ajoutez le plugin :

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import sourceI18n from 'source-i18n/unplugin/vite'

export default defineConfig({
  plugins: [sourceI18n()],
})
```

Les adaptateurs de bundler sont ESM uniquement (ils reposent sur unplugin 3) : chargez-les depuis une configuration ESM — `vite.config.ts`, `rollup.config.mjs`, `webpack.config.mjs`, ou tout fichier de configuration dans un paquet avec `"type": "module"`. Un `webpack.config.js` en CommonJS doit faire `await import('source-i18n/unplugin/webpack')` dans une configuration fonction. Le runtime lui-même est double : `import` et `require` fonctionnent pour `source-i18n`, `/react`, `/vue`, `/svelte`, `/vanilla`, `/node`.

Écrivez :

```tsx
<button>{t('Save project')}</button>
```

Lancez :

```bash
npm run dev
```

Les chaînes manquantes sont visibles dans l'UI et signalées dans la console. La traduction automatique en développement est **optionnelle** : activez `dev.autoTranslate` pour envoyer les chaînes manquantes à votre fournisseur, ou lancez :

```bash
npx source-i18n sync
```

## Compatible avec votre stack

| Builders | UI | Runtime |
|---|---|---|
| Vite | React 18 / 19 | Navigateur |
| Rollup | Vue 3 | Node |
| esbuild | Svelte | Electron |
| webpack | DOM natif | SSR |
| rspack | | |

Le runtime est petit et natif du framework : hooks pour React, composables pour Vue, un store pour Svelte, `data-i18n` pour le HTML brut, et un adaptateur Node pour les CLI et les processus principaux de bureau.

## Fournisseurs

| Fournisseur | Idéal pour |
|---|---|
| **Compatible OpenAI** | Qualité et vitesse : OpenAI, DeepSeek, Moonshot, Groq, OpenRouter ou tout endpoint compatible. |
| **DeepL** | Langues européennes et produits riches en glossaires. |
| **Ollama** | Traduction entièrement locale. Votre texte ne quitte jamais la machine. |
| **Manuel** | Vous voulez seulement l'extraction et la validation. |
| **Personnalisé** | Votre propre service de traduction, derrière une méthode `translate()`. |

Les clés vont dans des variables d'environnement — `OPENAI_API_KEY`, `SOURCE_I18N_API_KEY`, `DEEPL_API_KEY` ou `OLLAMA_HOST`. Elles sont lues dans Node et ne partent jamais vers le navigateur.

## CLI

| Commande | Ce qu'elle fait |
|---|---|
| `source-i18n init` | Crée la configuration et le répertoire des catalogues. |
| `source-i18n extract` | Liste tout ce qui sera traduit. Lecture seule. |
| `source-i18n sync` | Remplit les traductions manquantes et écrit les catalogues. |
| `source-i18n sync --dry-run` | Montre ce qui se passerait. Sans réseau ni écriture. |
| `source-i18n format` | Normalise les catalogues ; sûr à chaque commit. |
| `source-i18n check --strict` | La garde CI : manquantes, invalides, obsolètes, dynamiques. |
| `source-i18n skill --dir .claude/skills` | Installe l'Agent Skill portable dans le répertoire d'un client. |

`sync` n'écrase jamais les modifications humaines. `--prune` ne supprime que les entrées machine dont la source a disparu, et `--prune-manual` est un opt-in explicite.

## IA

Le paquet fournit les interfaces dont les agents ont réellement besoin.

**Serveur MCP**

```bash
npm i -D source-i18n @modelcontextprotocol/sdk
npx source-i18n-mcp --root /path/to/project
```

Outils : `i18n_extract`, `i18n_check` et `i18n_sync`. `sync` est en dry-run par défaut et n'écrit qu'avec confirmation explicite. Les ressources exposent la configuration expurgée et les catalogues.

**Agent Skill (portable)**

```bash
npx source-i18n skill --dir <your-client-skills-dir>
```

Le skill suit le standard ouvert Agent Skills et n'est pas lié à Claude Code. `.claude/skills/` n'est qu'un répertoire d'installation d'un client ; les autres clients Agent Skills chargent le même dossier depuis leur propre chemin de skills. Utilisez `--force` pour écraser une installation existante.

## Sécurité

- Les clés de fournisseur restent dans Node ; le bundle navigateur ne contient que les catalogues.
- Les builds de production n'ont ni endpoint de dev ni token de dev.
- L'endpoint de développement exige un token par session, des requêtes de même origine et du JSON.
- MCP expurge les champs `apiKey`, `token`, `secret` et `password`.
- `npm publish` exécute un scan de secrets sur chaque fichier publiable.

## Documentation

<img src="assets/docs.jpg" alt="site de documentation source-i18n" />

La documentation est maintenue sur un site séparé : 15 pages couvrant l'installation, les concepts, l'API, la CLI, la configuration, la CI, les fournisseurs, les exemples, le dépannage et les outils IA.

Elle est disponible en six langues — English, 中文, 日本語, 한국어, Español, Français — avec recherche, sommaire dans la page et URLs préfixées par la langue.

## Compromis

source-i18n est opinionné. Il convient quand :

- votre équipe écrit le texte directement dans le produit ;
- vous voulez que la traduction ait lieu au build, pas dans un portail séparé ;
- livrer compte plus que maintenir un registre de clés.

Il ne convient pas au contenu généré par l'utilisateur à l'exécution, aux chaînes d'erreur backend, ni aux workflows qui exigent un TMS complet avec rôles de traducteur et circuits d'approbation.

Changer une chaîne source crée une nouvelle entrée de catalogue. C'est le coût du « la source est la clé », et la raison d'être de la mémoire de traduction.

## État

- `209` tests, avec de vrais bundlers et un vrai navigateur
- Node.js `>= 20`
- Licence MIT
- Paquet : [`source-i18n`](https://www.npmjs.com/package/source-i18n)
- Code et issues : [`wreckglow/source-i18n`](https://github.com/wreckglow/source-i18n)
- Contact : [wreckglow@gmail.com](mailto:wreckglow@gmail.com)

## Avertissement

source-i18n est fourni « en l'état », sans garantie d'aucune sorte ; voir [LICENSE](./LICENSE).

- Les traductions automatiques proviennent de fournisseurs tiers et peuvent être erronées. Relisez les catalogues avant de publier ; les mainteneurs ne sont pas responsables des erreurs de traduction, des omissions ni de leurs conséquences.
- Les chaînes sources que vous choisissez de traduire sont envoyées au fournisseur configuré (un endpoint compatible OpenAI, DeepL, Ollama, votre propre provider, ou le modèle derrière votre client MCP). Ces données et le coût de l'API relèvent de vous et du fournisseur.
- Ne vous fiez pas à la traduction automatique sans relecture humaine là où une mauvaise traduction pourrait causer un préjudice : contenu médical, juridique, de sécurité, financier ou réglementé.

## Licence

MIT © source-i18n contributors

<br />

<div align="center">
  <sub>Écrivez l'interface. Publiez dans toutes les langues.</sub>
</div>
