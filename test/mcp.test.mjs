import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../dist/esm/mcp.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.join(here, '.tmp', 'mcp-fixture')

function json(result) {
  const block = result.content?.find((item) => item.type === 'text')
  assert.ok(block, 'tool returned text content')
  return JSON.parse(block.text)
}

test('MCP server exposes the i18n tools, resources and prompt', async (t) => {
  fs.rmSync(fixture, { recursive: true, force: true })
  fs.mkdirSync(path.join(fixture, 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(fixture, 'source-i18n.config.mjs'),
    `export default {
  source: 'zh-CN',
  locales: ['en-US'],
  provider: {
    name: 'fake',
    apiKey: 'secret-key',
    token: 'secret-token',
    async translate() { return {} },
  },
}\n`,
  )
  fs.writeFileSync(
    path.join(fixture, 'src', 'app.js'),
    `import { t } from 'source-i18n'\n\nt('保存项目')\nt('{count} 个文件', { count })\n`,
  )

  const server = await createServer({ root: fixture })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)

  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await client.connect(clientTransport)

  t.after(async () => {
    await client.close()
    await server.close()
    fs.rmSync(fixture, { recursive: true, force: true })
  })

  const tools = await client.listTools()
  assert.deepEqual(
    tools.tools.map((tool) => tool.name).sort(),
    ['i18n_check', 'i18n_extract', 'i18n_sync'],
  )

  const extract = json(await client.callTool({ name: 'i18n_extract', arguments: {} }))
  assert.equal(extract.sources, 2)
  assert.equal(extract.files, 1)
  assert.ok(extract.sample.some((item) => item.source === '保存项目'))

  const check = json(await client.callTool({ name: 'i18n_check', arguments: { strict: true } }))
  assert.equal(check.ok, false)
  assert.equal(check.locales[0].locale, 'en-US')
  assert.equal(check.locales[0].missing, 2)
  assert.equal(check.dynamic.length, 0)

  const sync = json(await client.callTool({ name: 'i18n_sync', arguments: {} }))
  assert.equal(sync.dryRun, true)
  assert.equal(
    fs.existsSync(path.join(fixture, 'i18n', 'locales', 'en-US.json')),
    false,
    'dry run must not write catalogs',
  )

  const config = await client.readResource({ uri: 'source-i18n://config' })
  const parsed = JSON.parse(config.contents[0].text)
  assert.equal(parsed.source, 'zh-CN')
  assert.equal(parsed.provider.apiKey, '[redacted]')
  assert.equal(parsed.provider.token, '[redacted]')

  const resources = await client.listResources()
  assert.ok(resources.resources.some((item) => item.uri === 'source-i18n://catalogs'))

  const prompts = await client.listPrompts()
  assert.ok(prompts.prompts.some((item) => item.name === 'review-i18n'))
})

