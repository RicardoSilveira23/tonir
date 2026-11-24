import { expect, test } from 'claude-code/testing'

import { done, ISSUES, loose, startIn, stubs, texts } from './test-support'

const repos = { 'C:/Code/alpha': 'C:/Code/alpha' }
const stop = (model: string, input: number, output: number) =>
  loose({
    kind: 'stop',
    ref: 1,
    stopReason: 'end_turn',
    usage: { model, input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  })
const detail = async (ui: Parameters<typeof texts>[0]) => (await texts(ui)).find(t => t.startsWith('main · ')) ?? ''

test('the main loop has a row of its own above Other agents: the session model, idle until it works', async ($, on) => {
  stubs(on, { repos })
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Look', prompt: 'a' }))
  const ui = await $.ui.mount(ISSUES)
  const keys = (await ui.findAll({ type: 'Box' })).map(b => String(b.key))

  expect(await texts(ui)).toContain('Main')
  expect(await detail(ui)).toMatch(/^main · Opus 5\.5 · ctx 0% · 0 · ≈\$0\.00 · idle · /)
  expect(keys.indexOf('agent:main')).toBeLessThan(keys.indexOf('section:agents'))
  await ui.unmount()
})

test('a model request of the main loop makes it running with its context and effort; the end of its turn makes it idle', async ($, on) => {
  stubs(on, { repos })
  on('turn.step', async function* (_, e) {
    yield stop('claude-opus-5-5', 400_000, 2_000) as never

    return loose({ turnId: e.turnId, index: e.index, answer: '', toolUses: [] })
  })
  await startIn($, 'C:/Code/alpha')
  for await (const chunk of $.turn.step(loose({ turnId: 't', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1 }))) void chunk
  const running = await $.ui.mount(ISSUES)

  expect(await detail(running)).toMatch(/^main · Opus 5\.5 · high · ctx /)

  expect(await detail(running)).toMatch(/ · ctx \d+% · /)
  expect(await detail(running)).not.toContain('ctx 0%')
  expect(await detail(running)).toContain(' · running · ')
  await running.unmount()

  await $.turn.complete(
    loose({
      ...done(),
      usage: { model: 'claude-opus-5-5', input_tokens: 400_000, output_tokens: 2_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    }),
  )
  const idle = await $.ui.mount(ISSUES)

  expect(await detail(idle)).toContain(' · idle · ')
  expect(await detail(idle)).toContain('402k')
  await idle.unmount()
})

test('a subagent request does not make the main loop running', async ($, on) => {
  stubs(on, { repos })
  on('turn.step', async function* (_, e) {
    yield stop('claude-sonnet-5-5', 1_000, 10) as never

    return loose({ turnId: e.turnId, index: e.index, answer: '', toolUses: [] })
  })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Look', prompt: 'a' }))
  for await (const chunk of $.turn.step(loose({ turnId: 't', index: 0, model: 'claude-sonnet-5-5', messageCount: 1, agentId: 'agent-1' }))) void chunk
  const ui = await $.ui.mount(ISSUES)

  expect(await detail(ui)).toContain(' · idle · ')
  await ui.unmount()
})

test('the status line follows each subagent request, not only the end of a turn', async ($, on) => {
  const { statuses } = stubs(on, { repos })
  on('turn.step', async function* (_, e) {
    yield stop('claude-sonnet-5-5', 1_000_000, 0) as never

    return loose({ turnId: e.turnId, index: e.index, answer: '', toolUses: [] })
  })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'Explore', model: 'claude-sonnet-5-5', description: 'Look', prompt: 'a' }))
  statuses.length = 0
  for await (const chunk of $.turn.step(loose({ turnId: 't', index: 0, model: 'claude-sonnet-5-5', messageCount: 1, agentId: 'agent-1' }))) void chunk

  expect(statuses.length).toBeGreaterThan(0)
  expect(statuses.at(-1)).not.toBe('≈$0.00 · cache 0%')
})

test('with no repository the Main row still sits above Other agents', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/notes')
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Look', prompt: 'a' }))
  const ui = await $.ui.mount(ISSUES)
  const words = await texts(ui)

  expect(words.some(t => t.startsWith('No git repository'))).toBe(true)
  expect(words.indexOf('Main')).toBeGreaterThan(-1)
  expect(words.indexOf('Main')).toBeLessThan(words.indexOf('Other agents · 1 ▾'))
  await ui.unmount()
})

for (const reason of ['aborted', 'error'] as const) test(`a main turn that ends ${reason} without usage sets the row back to idle`, async ($, on) => {
  stubs(on, { repos })
  on('turn.step', async function* (_, e) {
    yield stop('claude-opus-5-5', 1_000, 10) as never

    return loose({ turnId: e.turnId, index: e.index, answer: '', toolUses: [] })
  })
  await startIn($, 'C:/Code/alpha')
  for await (const chunk of $.turn.step(loose({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1 }))) void chunk
  await $.turn.complete(loose({ ...done(), reason, isAborted: reason === 'aborted' }))
  const ui = await $.ui.mount(ISSUES)

  expect(await detail(ui)).toContain(' · idle · ')
  await ui.unmount()
})

test("the engine's own context figure wins over Tonir's guess", async ($, on) => {
  stubs(on, { repos })
  on('session.usage', () => ({ value: loose<never>({ startedAt: 0, context: { tokens: 180_000, window: 200_000 }, rateLimits: [] }) }))
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  expect(await detail(ui)).toContain(' · ctx 90% · ')
  await ui.unmount()
})

test('a fresh or just compacted context reads 0 until the next response, not the old fill', async ($, on) => {
  stubs(on, { repos })
  on('turn.step', async function* (_, e) {
    yield stop('claude-opus-5-5', 400_000, 10) as never

    return loose({ turnId: e.turnId, index: e.index, answer: '', toolUses: [] })
  })
  on('session.usage', () => ({ value: loose<never>({ startedAt: 0, context: { window: 1_000_000 }, rateLimits: [] }) }))
  await startIn($, 'C:/Code/alpha')
  for await (const chunk of $.turn.step(loose({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1 }))) void chunk
  const ui = await $.ui.mount(ISSUES)

  expect(await detail(ui)).toContain(' · ctx 0% · ')
  await ui.unmount()
})
