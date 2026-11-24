import { expect, test } from 'claude-code/testing'

import { done, ISSUES, loose, startIn, stubs, texts } from './test-support'

const STEP = 'mcp__tonir__step'
const stop = (model: string, input: number, output: number, cacheRead: number) =>
  loose({
    kind: 'stop',
    ref: 1,
    stopReason: 'end_turn',
    usage: { model, input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: 0 },
  })
const repos = { 'C:/Code/alpha': 'C:/Code/alpha' }

test('a repeated description is one row: a second round of the same work', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Look around', prompt: 'a' }))
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'look around!', prompt: 'b' }))
  const ui = await $.ui.mount(ISSUES)
  const all = await texts(ui)

  expect(all.filter(t => t === 'Look around' || t === 'look around!').length).toBe(1)
  expect(all).toContain('Other agents · 1 ▾')
  await ui.unmount()
})

test('each model call adds to its agent', async ($, on) => {
  stubs(on, { repos })
  on('turn.step', async function* (_, e) {
    yield stop('claude-sonnet-5-5', 1_000_000, 0, 0) as never

    return loose({ turnId: e.turnId, index: e.index, answer: '', toolUses: [] })
  })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'Explore', model: 'claude-sonnet-5-5', description: 'Look', prompt: 'a' }))
  for (const index of [0, 1]) {
    for await (const chunk of $.turn.step(loose({ turnId: 't', index, model: 'claude-sonnet-5-5', messageCount: 1, agentId: 'agent-1' }))) void chunk
  }
  const ui = await $.ui.mount(ISSUES)
  const all = await texts(ui)

  // two 1M-token calls at $2 per million: 2M tokens, $4, and a context of 1M of the 1M window
  expect(all.some(t => t.endsWith('ctx 100% · 1.0M · ≈$4.00 · 0:00'))).toBe(true)
  await ui.unmount()
})

test('the step tool of a known agent updates its progress', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Look', prompt: 'a' }))
  await $.tool.call({ tool: STEP, agentId: 'agent-1', done: 2, total: 5, note: 'tests' })
  const ui = await $.ui.mount(ISSUES)

  expect(await texts(ui)).toContain('2/5')
  await ui.unmount()
})

test('a finished subagent leaves the running state', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Look', prompt: 'a' }))
  await $.turn.complete(done('agent-1'))
  const ui = await $.ui.mount(ISSUES)
  const all = await texts(ui)

  expect(all).not.toContain('starting…')
  expect(all).not.toContain('running')
  await ui.unmount()
})
