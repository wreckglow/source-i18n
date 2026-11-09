import test from 'node:test'
import assert from 'node:assert/strict'
import { createOpenAIProvider, ProviderError } from '../dist/esm/node/providers/openai.js'
import { createDeepLProvider } from '../dist/esm/node/providers/deepl.js'
import { createOllamaProvider } from '../dist/esm/node/providers/ollama.js'

const FAKE_KEY = 'sk-fake-key-do-not-leak-0123456789'
const REQUEST = { items: [{ id: 'a', text: 'a' }], from: 'zh-CN', to: 'en-US' }

const reply = (content) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content } }] }),
  text: async () => '',
})

async function withFetch(mock, run) {
  const original = globalThis.fetch
  globalThis.fetch = mock
  try {
    return await run()
  } finally {
    globalThis.fetch = original
  }
}

test('the API key is only sent in the authorization header', async () => {
  const calls = []
  await withFetch(
    async (url, init) => {
      calls.push({ url: String(url), init })
      return reply('{"translations":[{"i":0,"text":"Save Project"}]}')
    },
    async () => {
      const provider = createOpenAIProvider({
        name: 'openai',
        apiKey: FAKE_KEY,
        baseURL: 'http://127.0.0.1:9/v1',
        model: 'test-model',
      })
      const result = await provider.translate({
        items: [{ id: '淇濆瓨椤圭洰', text: '淇濆瓨椤圭洰' }],
        from: 'zh-CN',
        to: 'en-US',
      })
      assert.deepEqual(result, { 淇濆瓨椤圭洰: 'Save Project' })
    },
  )

  assert.equal(calls.length, 1)
  assert.equal(calls[0].init.headers.authorization, `Bearer ${FAKE_KEY}`)
  assert.ok(!calls[0].url.includes(FAKE_KEY), 'key must not appear in the URL')
  assert.ok(!String(calls[0].init.body).includes(FAKE_KEY), 'key must not appear in the body')
})

test('a provider error never echoes the key', async () => {
  await withFetch(
    async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => 'unauthorized: invalid api key',
    }),
    async () => {
      const provider = createOpenAIProvider({
        name: 'openai',
        apiKey: FAKE_KEY,
        baseURL: 'http://127.0.0.1:9/v1',
      })
      await assert.rejects(
        () => provider.translate({ items: [{ id: 'a', text: 'a' }], from: 'zh-CN', to: 'en-US' }),
        (error) => {
          assert.ok(error instanceof ProviderError)
          assert.equal(error.status, 401)
          assert.ok(!error.message.includes(FAKE_KEY), 'error message leaked the key')
          return true
        },
      )
    },
  )
})

test('missing key fails with a helpful message and no network call', async () => {
  const original = process.env.OPENAI_API_KEY
  const originalKeyless = process.env.SOURCE_I18N_API_KEY
  delete process.env.OPENAI_API_KEY
  delete process.env.SOURCE_I18N_API_KEY

  let called = false
  try {
    await withFetch(
      async () => {
        called = true
        return reply('{}')
      },
      async () => {
        const provider = createOpenAIProvider({ name: 'openai' })
        await assert.rejects(
          () => provider.translate({ items: [{ id: 'a', text: 'a' }], from: 'zh-CN', to: 'en-US' }),
          /no API key/,
        )
      },
    )
  } finally {
    if (original !== undefined) process.env.OPENAI_API_KEY = original
    if (originalKeyless !== undefined) process.env.SOURCE_I18N_API_KEY = originalKeyless
  }

  assert.equal(called, false)
})

test('providers without JSON mode fall back gracefully', async () => {
  const bodies = []
  await withFetch(
    async (_url, init) => {
      bodies.push(JSON.parse(String(init.body)))
      if (bodies.length === 1) {
        return { ok: false, status: 400, json: async () => ({}), text: async () => 'response_format unsupported' }
      }
      return reply('{"translations":[{"i":0,"text":"Save"}]}')
    },
    async () => {
      const provider = createOpenAIProvider({ name: 'openai', apiKey: FAKE_KEY, baseURL: 'http://127.0.0.1:9/v1' })
      const result = await provider.translate({ items: [{ id: 'x', text: 'x' }], from: 'zh-CN', to: 'en-US' })
      assert.deepEqual(result, { x: 'Save' })
    },
  )

  assert.equal(bodies.length, 2)
  assert.ok(bodies[0].response_format, 'first attempt uses JSON mode')
  assert.equal(bodies[1].response_format, undefined, 'retry drops JSON mode')
})

test('rate limits are retried with backoff', async () => {
  let calls = 0
  await withFetch(
    async () => {
      calls += 1
      if (calls <= 2) {
        return { ok: false, status: 429, json: async () => ({}), text: async () => 'rate limited' }
      }
      return reply('{"translations":[{"i":0,"text":"A"}]}')
    },
    async () => {
      const client = createOpenAIProvider({ name: 'openai', apiKey: FAKE_KEY, baseURL: 'http://127.0.0.1:9/v1' })
      const result = await client.translate(REQUEST)
      assert.deepEqual(result, { a: 'A' })
    },
  )
  assert.equal(calls, 3)
})

test('server errors are retried', async () => {
  let calls = 0
  await withFetch(
    async () => {
      calls += 1
      if (calls === 1) {
        return { ok: false, status: 503, json: async () => ({}), text: async () => 'unavailable' }
      }
      return reply('{"translations":[{"i":0,"text":"A"}]}')
    },
    async () => {
      const client = createOpenAIProvider({ name: 'openai', apiKey: FAKE_KEY, baseURL: 'http://127.0.0.1:9/v1' })
      await client.translate(REQUEST)
    },
  )
  assert.equal(calls, 2)
})

test('a 401 is not retried', async () => {
  let calls = 0
  await withFetch(
    async () => {
      calls += 1
      return { ok: false, status: 401, json: async () => ({}), text: async () => 'unauthorized' }
    },
    async () => {
      const client = createOpenAIProvider({ name: 'openai', apiKey: FAKE_KEY, baseURL: 'http://127.0.0.1:9/v1' })
      await assert.rejects(() => client.translate(REQUEST), /401/)
    },
  )
  assert.equal(calls, 1)
})

test('deepl keeps the key in the form body, not the URL', async () => {
  const calls = []
  await withFetch(
    async (url, init) => {
      calls.push({ url: String(url), init })
      return { ok: true, status: 200, json: async () => ({ translations: [{ text: 'Save' }] }), text: async () => '' }
    },
    async () => {
      const provider = createDeepLProvider({ name: 'deepl', apiKey: 'deepl-fake-key:fx' })
      const result = await provider.translate({ items: [{ id: 'x', text: 'x' }], from: 'zh-CN', to: 'en-US' })
      assert.deepEqual(result, { x: 'Save' })
    },
  )

  assert.ok(!calls[0].url.includes('deepl-fake-key'))
  assert.equal(calls[0].init.body.get('auth_key'), 'deepl-fake-key:fx')
})

test('ollama sends no credentials at all', async () => {
  const calls = []
  await withFetch(
    async (url, init) => {
      calls.push({ url: String(url), init })
      return { ok: true, status: 200, json: async () => ({ message: { content: '{"translations":[{"i":0,"text":"Save"}]}' } }), text: async () => '' }
    },
    async () => {
      const provider = createOllamaProvider({ name: 'ollama', model: 'qwen2.5:7b' })
      await provider.translate({ items: [{ id: 'x', text: 'x' }], from: 'zh-CN', to: 'en-US' })
    },
  )

  assert.equal(calls[0].url, 'http://127.0.0.1:11434/api/chat')
  assert.equal(calls[0].init.headers.authorization, undefined)
})

