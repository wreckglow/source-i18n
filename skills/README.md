# source-i18n Agent Skill

This folder follows the [Agent Skills](https://agentskills.io) open standard: a
`SKILL.md` with YAML frontmatter, plus optional reference files that load only
when needed.

It is **not tied to Claude Code**. `.claude/skills/` is simply one client's
install location; any Agent Skills-compatible client can load the same folder.

## Install

Install it with the CLI:

```bash
npx source-i18n skill --dir <your-client-skills-dir>
```

Or copy the folder manually:

```bash
cp -R skills/source-i18n <your-client-skills-dir>/
```

Common examples:

| Client | Skills directory |
|---|---|
| Claude Code | `.claude/skills/` (project) or `~/.claude/skills/` (personal) |
| Other Agent Skills clients | the directory documented by that client |

The skill is plain Markdown and has no runtime dependency. It teaches an agent
to write literal `t()` calls, preserve placeholders, use context, ask before a
paid `sync`, and verify with `check --strict`.

## Files

```
source-i18n/
  SKILL.md
  references/
    commands.md
    config.md
    troubleshooting.md
```
