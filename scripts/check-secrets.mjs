import fs from 'node:fs'
import path from 'node:path'

// Only files that can end up in the npm tarball are scanned. npm always packs
// README* at the package root, so the localized READMEs are included too.
const READMES = fs
  .readdirSync('.')
  .filter((name) => /^README(\..+)?\.md$/.test(name))

const TARGETS = [
  'dist',
  'skills',
  'assets',
  ...READMES,
  'CHANGELOG.md',
  'LICENSE',
  'package.json',
]

const PATTERNS = [
  ['OpenAI-compatible API key', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
  ['npm token', /\bnpm_[A-Za-z0-9]{20,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['secret assignment', /\b(?:API_KEY|SECRET|TOKEN|PASSWORD)\s*=\s*['"]?[A-Za-z0-9_\-]{16,}/],
]

function walk(target) {
  if (!fs.existsSync(target)) return []
  const stat = fs.statSync(target)
  if (stat.isFile()) return [target]
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(target, entry.name)
    return entry.isDirectory() ? walk(file) : [file]
  })
}

const findings = []

for (const target of TARGETS) {
  for (const file of walk(target)) {
    const buffer = fs.readFileSync(file)
    if (buffer.includes(0)) continue // skip binaries
    const text = buffer.toString('utf8')
    for (const [label, pattern] of PATTERNS) {
      if (pattern.test(text)) findings.push({ file, label })
    }
  }
}

if (findings.length > 0) {
  console.error('✖ refusing to publish: potential secret found')
  for (const finding of findings) {
    console.error(`  ${finding.label}: ${finding.file}`)
  }
  console.error('  Remove the value or load it from an environment variable.')
  process.exit(1)
}

console.log('✓ no secret-shaped strings in publishable files')
