import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(here, '..', 'skills', 'source-i18n')
const skillFile = path.join(dir, 'SKILL.md')

test('Agent Skill is portable and well formed', () => {
  const text = fs.readFileSync(skillFile, 'utf8')
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  assert.ok(frontmatter, 'SKILL.md starts with YAML frontmatter')

  const name = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1]?.trim()

  assert.equal(name, 'source-i18n')
  assert.ok(description && description.length <= 1024, 'description is present and within limit')
  assert.match(description, /source-i18n/)
  assert.ok(text.split('\n').length < 300, 'body stays focused')

  const references = ['references/config.md', 'references/commands.md', 'references/troubleshooting.md']
  for (const reference of references) {
    assert.ok(fs.existsSync(path.join(dir, reference)), `${reference} exists`)
    assert.ok(text.includes(reference), `SKILL.md points at ${reference}`)
  }
})
