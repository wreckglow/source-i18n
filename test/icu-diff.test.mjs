import test from 'node:test'
import assert from 'node:assert/strict'
import { IntlMessageFormat } from 'intl-messageformat'
import { formatMessage } from '../dist/esm/format.js'

/**
 * Differential test against FormatJS, the reference ICU MessageFormat
 * implementation. Date styles are excluded because FormatJS deliberately maps
 * `date, short` to a 2-digit year for zh-CN while Intl.DateTimeFormat keeps
 * four digits; both are valid locale data choices.
 */
const cases = [
  ['Hello {name}', { name: 'Ada' }],
  ['{n, number}', { n: 1234.5 }],
  ['{p, number, percent}', { p: 0.42 }],
  ['{n, plural, one {# file} other {# files}}', { n: 1 }],
  ['{n, plural, one {# file} other {# files}}', { n: 5 }],
  ['{n, plural, =0 {none} one {one} other {#}}', { n: 0 }],
  ['{n, plural, offset:1 =1 {only you} one {you and # other} other {you and # others}}', { n: 3 }],
  ['{g, select, male {he} female {she} other {they}}', { g: 'female' }],
  ["It''s '{count}'", {}],
  ['{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}', { n: 3 }],
  ['已导出 {count, plural, other {# 个文件}}', { count: 3 }],
  ['{a} and {b}', { a: 'x', b: 'y' }],
]

test('matches FormatJS on the supported ICU subset', () => {
  for (const locale of ['en-US', 'zh-CN']) {
    for (const [message, values] of cases) {
      const expected = String(new IntlMessageFormat(message, locale).format(values))
      const actual = formatMessage(message, values, locale)
      assert.equal(actual, expected, `${locale} :: ${message}`)
    }
  }
})

test('date styles follow Intl, not FormatJS short-year convention', () => {
  const date = new Date('2024-03-05T12:00:00Z')
  assert.match(formatMessage('{d, date, long}', { d: date }, 'en-US'), /2024/)
  assert.equal(formatMessage('{d, date, short}', { d: date }, 'zh-CN'), '2024/3/5')
})
