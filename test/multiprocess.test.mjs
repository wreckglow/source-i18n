import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '.tmp')

function project(name) {
  const dir = path.join(ROOT, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(path.join(dir, 'i18n/locales'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'source-i18n.config.mjs'),
    `export default {
  source: 'zh-CN',
  locales: ['en-US'],
  provider: {
    name: 'fake',
    translate: async (req) => {
      await new Promise((r) => setTimeout(r, 2))
      return Object.fromEntries(req.items.map((i) => [i.id, 'EN:' + i.text]))
    },
  },
  dev: { autoTranslate: true },
}
`,
  )
  return dir
}

function startChild(root) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(HERE, 'helpers/writer-child.mjs'), root], {
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    let buffer = ''
    const timer = setTimeout(() => reject(new Error('child did not start in time')), 10_000)

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      const line = buffer.split('\n')[0]
      if (!line) return
      clearTimeout(timer)
      resolve({ child, info: JSON.parse(line) })
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function post(port, token, source) {
  const response = await fetch(`http://127.0.0.1:${port}/__source-i18n/translate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-source-i18n-token': token },
    body: JSON.stringify({ source, locale: 'en-US' }),
  })
  return response.status
}

test('two OS processes writing the same catalog never lose keys', { timeout: 60_000 }, async () => {
  const dir = project('multiprocess')
  const started = []

  try {
    const [a, b] = await Promise.all([startChild(dir), startChild(dir)])
    started.push(a.child, b.child)

    const targets = [
      { port: a.info.port, token: a.info.token },
      { port: b.info.port, token: b.info.token },
    ]

    // 20 concurrent writes split across two separate node processes.
    const statuses = await Promise.all(
      Array.from({ length: 20 }, (_, i) => post(targets[i % 2].port, targets[i % 2].token, `跨进程${i}`)),
    )

    assert.deepEqual([...new Set(statuses)], [200])

    const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'i18n/locales/en-US.json'), 'utf8'))
    const keys = Object.keys(catalog.messages)
    assert.equal(keys.length, 20, `only ${keys.length}/20 keys survived`)

    for (let i = 0; i < 20; i += 1) {
      assert.equal(catalog.messages[`跨进程${i}`], `EN:跨进程${i}`)
    }

    // The lock directory must be gone afterwards.
    assert.equal(fs.existsSync(path.join(dir, 'i18n/locales/en-US.json.lock')), false)
  } finally {
    for (const child of started) child.kill()
  }
})
