import { expect, test } from 'claude-code/testing'

import { fmtTime, modelName as panelModelName, STEP_BRIEF, STEP_TOOL } from './agents-panel'
import { costOf, fmtTokens, isKnownModel, modelName, windowOf } from './cost'

const usage = (input: number, output: number, read: number, write: number) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
})
const r6 = (n: number) => Math.round(n * 1e6) / 1e6
const ONE_EACH = usage(1e6, 1e6, 1e6, 1e6)

test('costOf prices each family: input, output, cache read and cache write', () => {
  expect(r6(costOf('claude-opus-5-5', ONE_EACH))).toBe(r6(4 + 20 + 0.2 + 5))
  expect(r6(costOf('claude-sonnet-5-5', ONE_EACH))).toBe(r6(2 + 10 + 0.1 + 2.5))
  expect(r6(costOf('claude-haiku-5-5', ONE_EACH))).toBe(r6(0.1 + 0.5 + 0.01 + 0.125))
  expect(r6(costOf('claude-fable-5-2', ONE_EACH))).toBe(r6(8 + 40 + 0.2 + 10))
  expect(r6(costOf('opus', usage(500_000, 0, 0, 0)))).toBe(r6(2))
})

test('Haiku 5.5 charges the long-context rate for one request above 100K prompt tokens', () => {
  expect(r6(costOf('claude-haiku-5-5', usage(200_000, 0, 0, 0), true))).toBe(r6(0.1))
  expect(r6(costOf('claude-haiku-5-5', usage(200_000, 0, 0, 0), false))).toBe(r6(0.02))
  expect(r6(costOf('claude-haiku-5-5', usage(50_000, 0, 0, 0), true))).toBe(r6(0.005))
})

test('an unknown model costs nothing and is marked unknown', () => {
  expect(costOf('mystery-1', ONE_EACH)).toBe(0)
  expect(isKnownModel('mystery-1')).toBe(false)
  expect(isKnownModel('claude-opus-5-5')).toBe(true)
  expect(isKnownModel('sonnet')).toBe(true)
})

test('fmtTokens: as is under 1,000, then 1.2k, 34k, 1.2M', () => {
  expect(fmtTokens(0)).toBe('0')
  expect(fmtTokens(999)).toBe('999')
  expect(fmtTokens(1234)).toBe('1.2k')
  expect(fmtTokens(34_000)).toBe('34k')
  expect(fmtTokens(1_234_567)).toBe('1.2M')
})

test('fmtTime: m:ss under an hour, h:mm:ss above', () => {
  expect(fmtTime(0)).toBe('0:00')
  expect(fmtTime(65_000)).toBe('1:05')
  expect(fmtTime(3_599_000)).toBe('59:59')
  expect(fmtTime(3_600_000)).toBe('1:00:00')
  expect(fmtTime(3_725_000)).toBe('1:02:05')
})

test('modelName gives a short display name', () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelName('claude-sonnet-5')).toBe('Sonnet 5')
  expect(modelName('opus')).toBe('Opus')
  expect(modelName('inherit')).toBe('Inherit')
  expect(modelName('')).toBe('')
  expect(panelModelName('claude-fable-5-2')).toBe('Fable 5.2')
})

test('the context window is 1M, and 200K for Haiku 4.5', () => {
  expect(windowOf('claude-opus-5-5')).toBe(1_000_000)
  expect(windowOf('claude-haiku-4-5')).toBe(200_000)
})

test('the step brief names the tool', () => {
  expect(STEP_BRIEF).toContain(STEP_TOOL)
})
