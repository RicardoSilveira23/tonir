import { expect, test } from 'claude-code/testing'

import { done, ISSUES, issueKeys, loose, startIn, stubs, texts } from './test-support'

const repos = { 'C:/Code/alpha': 'C:/Code/alpha' }
const LONG = 'A very long title that goes on and on well past the width of any pane a person could dock beside the chat'

const issue = (n: number, title: string, association = 'OWNER') => ({
  number: n,
  title,
  html_url: `https://github.com/o/r/issues/${n}`,
  updated_at: `2026-11-0${9 - n}T00:00:00Z`,
  labels: [],
  user: { login: 'ana' },
  author_association: association,
})

const slots = async (ui: { findAll: (q: never) => Promise<readonly { key?: unknown; props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Box' } as never)).filter(b => b.key === 'slot')

test('Build and every status word on an issue row share one width and are plain; none shrinks, whatever the title', async ($, on) => {
  stubs(on, {
    repos,
    spawnThrows: true,
    depth: 3,
    branches: { 'C:/Code/alpha': ['issue-2-b'] },
    gh: { exitCode: 0, stderr: '', stdout: JSON.stringify([issue(1, LONG), issue(2, LONG), issue(3, LONG), issue(4, LONG, 'NONE')]) },
  })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  // #1 Build, #2 Branch ready, #4 outside author; then #3 fails to start.
  await ui.press({ key: 'build:3' })
  const all = await slots(ui)
  const widths = new Set(all.map(b => b.props.width))

  expect(all).toHaveLength(4)
  // One width, never shrinking; Build and every status word are plain text: no border, fill or height of their own.
  expect(widths.size).toBe(1)
  expect(all.every(b => b.props.flexShrink === 0 && b.props.height === undefined)).toBe(true)
  expect(all.every(b => b.props.borderStyle === undefined && b.props.backgroundColor === undefined && b.props.paddingY === undefined)).toBe(true)
  const words = await texts(ui)

  expect(words).toEqual(expect.arrayContaining(['Branch ready', 'Failed', 'outside author']))
  expect(await ui.find({ key: 'build:1' })).toBeDefined()
  expect(await issueKeys(ui)).toHaveLength(4)
  await ui.unmount()
})

test('an agent row has no slot element; its bar and one word say where it stands', async ($, on) => {
  stubs(on, {
    repos,
    agents: [
      { id: 'bg', description: 'Waiting on a shell', type: 'coder', status: 'waiting', taskStatus: 'completed', kind: 'local_agent', label: '', startTime: 1_000_000, cwd: '/', model: 'claude-sonnet-5-5', tokenCount: 0, tokenSamples: [], hasRow: true } as never,
    ],
  })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'coder', description: 'Running one', prompt: 'a' }))
  await $.agent.spawn(loose({ subagentType: 'validator', description: 'Done one', prompt: 'b' }))
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Failed one', prompt: 'c' }))
  await $.turn.complete(done('agent-2'))
  await $.turn.complete({ ...done('agent-3'), reason: 'error' } as never)
  const ui = await $.ui.mount(ISSUES)
  const bar = async (title: string) =>
    String((await ui.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith(title))?.props.source)

  expect(await slots(ui)).toHaveLength(3)
  // Only the three issue rows have one; the agent rows draw none.
  expect(await bar('Waiting on a shell')).toContain('fill="#e0a15a"')
  expect(await bar('Running one')).toContain('fill="#e0a15a"')
  // A finished agent's bar is full and muted.
  expect(await bar('Done one')).toContain('fill="#3f6e44"')
  expect(await bar('Failed one')).toContain('fill="#e5534b"')
  const all = await texts(ui)

  expect(all).toEqual(expect.arrayContaining(['background work', 'done', 'failed', 'starting…']))
  expect(all).not.toContain('running')
  await ui.unmount()
})

test('a building issue shows its crew line with the elapsed time, not a badge', async ($, on) => {
  const { clock } = stubs(on, { repos, depth: 3 })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  await ui.press({ key: 'build:7' })
  await clock.advance(65_000)
  const card = (await ui.findAll({ type: 'Box' })).find(b => b.key === 'issue:7')

  expect(card).toBeDefined()
  expect((await texts(ui)).some(t => t.startsWith('lead ·') && /[0-9]+:[0-9][0-9]$/.test(t))).toBe(true)
  // The one slot left on the page belongs to the two issue rows still open.
  expect(await slots(ui)).toHaveLength(2)
  await ui.unmount()
})
