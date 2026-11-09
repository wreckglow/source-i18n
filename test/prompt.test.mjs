import test from 'node:test'
import assert from 'node:assert/strict'
import {
  composePlural,
  parseTranslations,
  pluralCategories,
  pluralSpecs,
  systemPrompt,
  userPrompt,
} from '../dist/esm/node/providers/prompt.js'

const enRequest = {
  items: [
    { id: '保存项目', text: '保存项目' },
    { id: '已导出 {count} 个文件', text: '已导出 {count} 个文件' },
    { id: '你好 {name}', text: '你好 {name}' },
  ],
  from: 'zh-CN',
  to: 'en-US',
}

test('plural categories come from Intl', () => {
  assert.deepEqual(pluralCategories('en-US'), ['one', 'other'])
  assert.deepEqual(pluralCategories('ko-KR'), ['other'])
  assert.deepEqual(pluralCategories('zh-CN'), ['other'])
})

test('exactly one numeric placeholder drives the plural categories', () => {
  const specs = pluralSpecs(enRequest)
  assert.deepEqual(specs, { 1: { placeholder: 'count', categories: ['one', 'other'] } })

  // Korean has no plural forms, so nothing is sent as a plural item.
  assert.deepEqual(pluralSpecs({ ...enRequest, to: 'ko-KR' }), {})

  // A non-numeric placeholder may sit in the same sentence.
  assert.deepEqual(
    pluralSpecs({
      items: [{ id: 'x', text: '{count} 个文件来自 {name}' }],
      from: 'zh-CN',
      to: 'en-US',
    }),
    { 0: { placeholder: 'count', categories: ['one', 'other'] } },
  )

  // Which placeholders are numeric is configuration, not a name pattern.
  assert.deepEqual(
    pluralSpecs({
      items: [
        { id: 'x', text: '{count} / {total}' },
        { id: 'y', text: '你好 {name}' },
      ],
      from: 'zh-CN',
      to: 'en-US',
    }),
    { 0: { placeholder: 'count', categories: ['one', 'other'] } },
  )

  // Configured numeric placeholders can be any name...
  assert.deepEqual(
    pluralSpecs({
      items: [{ id: 'x', text: '{inputs} 个输入' }],
      from: 'zh-CN',
      to: 'en-US',
      pluralPlaceholders: ['inputs'],
    }),
    { 0: { placeholder: 'inputs', categories: ['one', 'other'] } },
  )

  // ...but two of them still leave the sentence ambiguous.
  assert.deepEqual(
    pluralSpecs({
      items: [{ id: 'x', text: '{inputs} / {outputs}' }],
      from: 'zh-CN',
      to: 'en-US',
      pluralPlaceholders: ['inputs', 'outputs'],
    }),
    {},
  )
})

test('plural bodies keep other placeholders intact', () => {
  const specs = { 0: { placeholder: 'count', categories: ['one', 'other'] } }
  const out = parseTranslations(
    '{"translations":[{"i":0,"one":"# file from {name}","other":"# files from {name}"}]}',
    specs,
  )
  assert.equal(out[0], '{count, plural, one {# file from {name}} other {# files from {name}}}')
})

test('the prompt tells the model to fill slots, not to write ICU', () => {
  const en = systemPrompt(enRequest)
  assert.match(en, /one, other/)
  assert.match(en, /one field per category/)
  assert.match(en, /"#"/)

  const ko = systemPrompt({ ...enRequest, to: 'ko-KR' })
  assert.match(ko, /single plural form/)
  assert.doesNotMatch(ko, /one field per category/)
})

test('the user payload marks plural items', () => {
  const payload = JSON.parse(userPrompt(enRequest))
  assert.equal(payload.strings[1].plural.placeholder, 'count')
  assert.deepEqual(payload.strings[1].plural.categories, ['one', 'other'])
  assert.equal(payload.strings[0].plural, undefined)
})

test('slots are assembled into valid ICU', () => {
  const specs = { 0: { placeholder: 'count', categories: ['one', 'other'] } }
  const out = parseTranslations(
    '{"translations":[{"i":0,"one":"# file","other":"# files"}]}',
    specs,
  )
  assert.equal(out[0], '{count, plural, one {# file} other {# files}}')
})

test('braces echoed by the model are stripped from slots', () => {
  const specs = { 0: { placeholder: 'count', categories: ['one', 'other'] } }
  const out = parseTranslations(
    '{"translations":[{"i":0,"one":"{# file}","other":"{# files}"}]}',
    specs,
  )
  assert.equal(out[0], '{count, plural, one {# file} other {# files}}')
})

test('a broken assembly falls back to text instead of writing invalid ICU', () => {
  const specs = { 0: { placeholder: 'count', categories: ['one', 'other'] } }
  const out = parseTranslations(
    '{"translations":[{"i":0,"one":"{# file","text":"Exported {count} files"}]}',
    specs,
  )
  assert.equal(out[0], 'Exported {count} files')
})

test('unrequested categories are ignored', () => {
  const specs = { 0: { placeholder: 'count', categories: ['one', 'other'] } }
  const out = parseTranslations(
    '{"translations":[{"i":0,"one":"# item","zero":"none","other":"# items"}]}',
    specs,
  )
  assert.equal(out[0], '{count, plural, one {# item} other {# items}}')
})

test('missing "other" is synthesised from text', () => {
  const specs = { 0: { placeholder: 'count', categories: ['one', 'other'] } }
  const out = parseTranslations('{"translations":[{"i":0,"one":"# item","text":"# items"}]}', specs)
  assert.equal(out[0], '{count, plural, one {# item} other {# items}}')
})

test('fenced JSON and a plain text reply still work', () => {
  const specs = { 0: { placeholder: 'count', categories: ['one', 'other'] } }
  const fenced = parseTranslations(
    '```json\n{"translations":[{"i":0,"one":"# file","other":"# files"}]}\n```',
    specs,
  )
  assert.equal(fenced[0], '{count, plural, one {# file} other {# files}}')

  const plain = parseTranslations('{"translations":[{"i":0,"text":"Save"}]}', specs)
  assert.equal(plain[0], 'Save')
})

test('composePlural returns undefined when there is nothing to use', () => {
  assert.equal(composePlural({}, { placeholder: 'count', categories: ['one', 'other'] }), undefined)
})
