import { expect, test } from 'claude-code/testing'

import { done, ISSUES, issueKeys, loose, startIn, stubs, texts, head } from './test-support'

const STEP = 'mcp__tonir__step'
const repos = { 'C:/Code/alpha': 'C:/Code/alpha' }

const info = (over: Record<string, unknown>) => ({
  id: 'bg-1',
  description: 'Review the mod',
  type: 'validator',
  status: 'waiting',
  kind: 'local_agent',
  taskStatus: 'completed',
  label: '',
  startTime: 1_000_000,
  cwd: '/',
  model: 'claude-opus-5-5',
  tokenCount: 0,
  tokenSamples: [],
  hasRow: true,
  ...over,
})

test("only Tonir's own agents and the subagents they start get the step brief, once", async ($, on) => {
  const { spawns } = stubs(on)
  await startIn($, 'C:/Code')
  // Another agent of the session: left alone.
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Look', prompt: 'Find the thing.' }))
  // A Tonir agent: its prompt already names the tool, so it is left as it is.
  await $.agent.spawn(loose({ subagentType: 'coder', description: 'Code', prompt: `Do it.\n${STEP} is available.` }))
  // A subagent the Tonir agent starts: briefed once.
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Help', prompt: 'Look around.', parentAgentId: 'agent-2' }))
  // A subagent of the other agent: left alone.
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'More', prompt: 'And here.', parentAgentId: 'agent-1' }))

  expect(spawns[0]?.prompt).toBe('Find the thing.')
  expect(spawns[1]?.prompt).toBe(`Do it.\n${STEP} is available.`)
  expect((spawns[2]?.prompt.split(STEP).length ?? 0) - 1).toBe(1)
  expect(spawns[2]?.prompt.startsWith('Look around.')).toBe(true)
  expect(spawns[3]?.prompt).toBe('And here.')
})

test('there is one pane: the commands, the menu and the bar open Tonir and nothing else', async ($, on) => {
  const { opened } = stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  await $.command.run(loose({ command: 'tonir', args: '' }))
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Look', prompt: 'b' }))

  expect(opened.length).toBeGreaterThan(0)
  expect([...new Set(opened)]).toEqual(['tonir'])
})

test('the sections come in order: Building, Other agents, In this session, Open', async ($, on) => {
  stubs(on, { repos, depth: 3 })
  await startIn($, 'C:/Code/alpha')
  await $.prompt.submit(loose({ text: 'see #8' }))
  const ui = await $.ui.mount(ISSUES)

  await ui.press({ key: 'build:7' })
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Look', prompt: 'b' }))
  const all = await texts(ui)
  const at = (prefix: string) => all.findIndex(t => t.startsWith(prefix))

  expect(at('Session')).toBeGreaterThan(-1)
  expect([at('Session'), at('Building'), at('Other agents'), at('In this session'), at('Open')].every((n, i, list) => n > (list[i - 1] ?? -1))).toBe(true)
  await ui.unmount()
})

test('Other agents holds only the agents no issue of the list claims; a tied agent is not in it', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'coder', model: 'opus', description: '#7 Fix chart labels', prompt: 'a' }))
  await $.agent.spawn(loose({ subagentType: 'Explore', model: 'haiku', description: 'Look around', prompt: 'b' }))
  await $.agent.spawn(loose({ subagentType: 'validator', description: '#999 Gone issue', prompt: 'c' }))
  await $.tool.call({ tool: STEP, agentId: 'agent-2', done: 2, total: 5, note: 'tests' })
  const ui = await $.ui.mount(ISSUES)
  const keys = (await ui.findAll({ type: 'Box' })).map(b => String(b.key))
  const all = await texts(ui)

  expect(all).toContain('Other agents · 2 ▾')
  expect(keys).toContain('agent:agent-2')
  expect(keys).toContain('agent:agent-3')
  expect(keys).not.toContain('agent:agent-1')
  expect(all).toContain('Look around')
  expect(all).toContain('2/5')
  // #7 is claimed by an issue of the list: it is a building card, not an Other agents row.
  expect(await issueKeys(ui)).toContain('issue:7')
  await ui.unmount()
})

test('the crew lines of a building issue carry kind, model, state, cost and time', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'coder', model: 'claude-sonnet-5-5', description: '#7 Fix chart labels', prompt: 'a' }))
  await $.tool.call({ tool: STEP, agentId: 'agent-1', done: 2, total: 5, note: 'tests' })
  const ui = await $.ui.mount(ISSUES)
  const all = await texts(ui)

  expect(all).toContain('coder')
  // One small grey line: kind, model, where it stands, cost, time.
  expect(all.some(t => /^coder · Sonnet 5\.5 · 2\/5 tests · ≈\$\d+\.\d\d · \d+:\d\d$/.test(t))).toBe(true)
  expect(all).toContain('Building · 1 ▾')
  // No agent outside an issue: no Other agents section.
  expect(all.some(t => t.startsWith('Other agents'))).toBe(false)
  await ui.unmount()
})

test('there is no pane-wide collapse control; each section folds and opens again', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Look', prompt: 'b' }))
  const ui = await $.ui.mount(ISSUES)

  expect(await ui.find({ key: 'compact' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Button' })).some(b => /Collapse|Expand/.test(String(b.text)))).toBe(false)
  expect(await texts(ui)).toContain('Look')
  await ui.press({ key: 'fold:agents' })
  expect(await texts(ui)).not.toContain('Look')
  expect((await head(ui, 'fold:agents'))).toBe('Other agents · 1 ▸')
  await ui.press({ key: 'fold:agents' })
  expect(await texts(ui)).toContain('Look')
  await ui.unmount()
})

test('an agent whose turn ended but whose background work runs is listed as running in the background', async ($, on) => {
  stubs(on, { repos, agents: [info({}) as never] })
  await startIn($, 'C:/Code/alpha')
  await $.turn.complete(done('bg-1'))
  const ui = await $.ui.mount(ISSUES)
  const all = await texts(ui)

  expect(all).toContain('Other agents · 1 ▾')
  expect(all).toContain('background work')
  await ui.unmount()
})

test('an agent the engine lists but the mod never saw is listed too', async ($, on) => {
  stubs(on, { repos, agents: [info({ status: 'running', taskStatus: 'running', description: 'Somebody else' }) as never] })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  expect(await texts(ui)).toContain('Somebody else')
  await ui.unmount()
})

test('before its first step report an agent says starting…, not 0/N', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'coder', description: 'Work', prompt: 'a' }))
  const ui = await $.ui.mount(ISSUES)

  expect(await texts(ui)).toContain('starting…')
  await $.tool.call({ tool: STEP, agentId: 'agent-1', done: 0, total: 4 })
  expect(await texts(ui)).toContain('starting…')
  expect((await texts(ui)).some(t => t === '0/4')).toBe(false)
  await $.tool.call({ tool: STEP, agentId: 'agent-1', done: 1, total: 4 })
  expect(await texts(ui)).toContain('1/4')
  await ui.unmount()
})

test('the header totals are the session: the main loop plus every agent', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  await $.turn.complete({
    ...done(),
    usage: { model: 'claude-sonnet-5-5', input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 9000, cache_creation_input_tokens: 1000 },
  })
  await $.agent.spawn(loose({ subagentType: 'Explore', model: 'haiku', description: 'Look', prompt: 'b' }))
  await $.turn.complete({
    ...done('agent-1'),
    usage: { model: 'claude-haiku-4-5', input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 9000, cache_creation_input_tokens: 1000 },
  })
  const ui = await $.ui.mount(ISSUES)
  const header = (await texts(ui)).find(t => t.startsWith('Session'))

  expect(header).toContain('23k tokens')
  expect(header).toContain('cache 82%')
  expect(header).toMatch(/^Session · ≈\$\d/)
  await ui.unmount()
})

test('Tonir opens when an agent starts after a quiet spell, unless autoOpenAgents is never', async ($, on) => {
  const { opened } = stubs(on)
  await startIn($, 'C:/Code')
  opened.length = 0
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Look', prompt: 'b' }))

  expect(opened).toContain('tonir')
})

test('autoOpenAgents never keeps the pane shut', { options: { autoOpenAgents: 'never' } }, async ($, on) => {
  const { opened } = stubs(on)
  await startIn($, 'C:/Code')
  opened.length = 0
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Look', prompt: 'b' }))

  expect(opened).not.toContain('tonir')
})

test('the step tool ignores the main session and unknown agents', async ($, on) => {
  stubs(on)
  await startIn($, 'C:/Code')
  const main = await $.tool.call({ tool: STEP, done: 1, total: 3 })
  const unknown = await $.tool.call({ tool: STEP, agentId: 'nobody', done: 1, total: 3 })

  expect(String(main.result)).toContain('ignored')
  expect(String(unknown.result)).toContain('ignored')
})

test('with no agent there is no Other agents section, with or without a repository', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code')
  const none = await $.ui.mount(ISSUES)

  expect((await texts(none)).some(t => t.startsWith('Other agents') || t.startsWith('No agents'))).toBe(false)
  await none.unmount()
})
