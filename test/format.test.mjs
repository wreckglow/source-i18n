import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatMessage,
  placeholdersOf,
  assertValidMessage,
  MessageSyntaxError,
} from '../dist/esm/format.js'

test('interpolates named placeholders', () => {
  assert.equal(formatMessage('已导出 {count} 个文件', { count: 12 }, 'zh-CN'), '已导出 12 个文件')
  assert.equal(formatMessage('Hello {name}', { name: 'Ada' }, 'en-US'), 'Hello Ada')
})

test('formats english plurals', () => {
  const message = '{count, plural, one {# file} other {# files}}'
  assert.equal(formatMessage(message, { count: 1 }, 'en-US'), '1 file')
  assert.equal(formatMessage(message, { count: 3 }, 'en-US'), '3 files')
  assert.equal(formatMessage(message, { count: 0 }, 'en-US'), '0 files')
})

test('formats chinese plurals through the other branch', () => {
  const message = '{count, plural, other {# 个文件}}'
  assert.equal(formatMessage(message, { count: 1 }, 'zh-CN'), '1 个文件')
  assert.equal(formatMessage(message, { count: 9 }, 'zh-CN'), '9 个文件')
})

test('supports plural offset', () => {
  const message = '{n, plural, offset:1 =1 {只有你} one {你和其他 # 人} other {你和 # 人}}'
  assert.equal(formatMessage(message, { n: 1 }, 'zh-CN'), '只有你')
  assert.equal(formatMessage(message, { n: 3 }, 'zh-CN'), '你和 2 人')
})

test('supports select', () => {
  const message = '{gender, select, male {他} female {她} other {TA}}'
  assert.equal(formatMessage(message, { gender: 'female' }, 'zh-CN'), '她')
  assert.equal(formatMessage(message, { gender: 'unknown' }, 'zh-CN'), 'TA')
})

test('formats numbers', () => {
  assert.equal(formatMessage('{n, number}', { n: 1234.5 }, 'en-US'), '1,234.5')
  assert.equal(formatMessage('{p, number, percent}', { p: 0.42 }, 'en-US'), '42%')
  assert.equal(formatMessage('{n, number, currency:USD}', { n: 3 }, 'en-US'), '$3.00')
})

test('formats dates', () => {
  const value = new Date('2024-03-05T12:00:00Z')
  const formatted = formatMessage('{d, date, long}', { d: value }, 'en-US')
  assert.match(formatted, /2024/)
  assert.doesNotMatch(formatted, /\{/)
})

test('supports icu apostrophe quoting', () => {
  assert.equal(formatMessage("It''s '{count}'", {}, 'en-US'), "It's {count}")
})

test('keeps unknown placeholders visible', () => {
  assert.equal(formatMessage('Hello {name}', {}, 'en-US'), 'Hello {name}')
})

test('falls back to the raw template when malformed', () => {
  const broken = 'a { b'
  assert.equal(formatMessage(broken, { b: 1 }, 'en-US'), broken)
})

test('source text without placeholders is returned as-is', () => {
  assert.equal(formatMessage('保存项目', undefined, 'zh-CN'), '保存项目')
})

test('placeholdersOf ignores icu keywords', () => {
  assert.deepEqual(
    placeholdersOf('{a} {b, number} {c, plural, one {# x} other {y}}'),
    ['a', 'b', 'c'],
  )
})

test('assertValidMessage rejects unbalanced braces', () => {
  assert.throws(() => assertValidMessage('{a'), MessageSyntaxError)
  assert.doesNotThrow(() => assertValidMessage('{a}'))
})

test('nested option bodies work', () => {
  const message = '{n, plural, other {{name} 有 # 条消息}}'
  assert.equal(formatMessage(message, { n: 2, name: '小明' }, 'zh-CN'), '小明 有 2 条消息')
})

test('formatting accepts a string date', () => {
  assert.doesNotMatch(formatMessage('{d, date}', { d: '2024-01-01T00:00:00Z' }, 'en-US'), /\{/)
})
