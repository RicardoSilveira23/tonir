import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { shapeOf } from './look'
import { done, ISSUES, issueKeys, loose, startIn, stubs, texts, head } from './test-support'

const repos = { 'C:/Code/alpha': 'C:/Code/alpha' }

// What the Pane render is given when the person docks it left or right (tall), top or bottom (wide, short) or squeezes it.
const sized = <T extends { props: object }>(pane: T, bodyColumns: number, bodyRows: number) =>
  ({ ...pane, props: { ...pane.props, bodyColumns, scroll: { offset: 0, bodyRows } } }) as T

const TALL = [60, 30] as const
const WIDE = [150, 14] as const
const NARROW = [30, 30] as const

const many = (n: number, extra: object = {}) =>
  JSON.stringify(
    Array.from({ length: n }, (_, i) => ({
      number: i + 1,
      title: `Issue ${i + 1}`,
      html_url: `https://github.com/o/r/issues/${i + 1}`,
      updated_at: '2026-11-01T00:00:00Z',
      labels: [],
      user: { login: 'ana' },
      author_association: 'OWNER',
      ...extra,
    })),
  )

const seed = async ($: Engine, on: On) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'coder', description: 'Write the thing', prompt: 'a' }))
  await $.agent.spawn(loose({ subagentType: 'validator', description: 'Review the thing', prompt: 'b' }))
  await $.turn.complete(done('agent-2'))
}

test('the shape follows the room the pane is given', () => {
  expect(shapeOf(...TALL)).toBe('tall')
  expect(shapeOf(...WIDE)).toBe('wide')
  expect(shapeOf(...NARROW)).toBe('narrow')
  expect(shapeOf(35, 10)).toBe('narrow')
  expect(shapeOf(100, 40)).toBe('tall')
})

test('tall: one column of folding sections', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(sized(ISSUES, ...TALL))

  expect(await ui.find({ key: 'fold:open' })).toBeDefined()
  expect(await ui.find({ key: 'activity' })).toBeUndefined()
  expect(await ui.find({ key: 'build:7' })).toBeDefined()
  await ui.unmount()
})

test('wide and short: header row, an Activity column with a divider, issues in columns on the right', async ($, on) => {
  stubs(on, { repos, gh: { exitCode: 0, stdout: many(30), stderr: '' } })
  await startIn($, 'C:/Code/alpha')
  await $.prompt.submit(loose({ text: 'see #8' }))
  const ui = await $.ui.mount(sized(ISSUES, ...WIDE))
  const keys = async () => (await ui.findAll({ type: 'Box' })).map(b => String(b.key))

  expect(await ui.find({ key: 'search' })).toBeDefined()
  expect(await ui.find({ key: 'refresh' })).toBeDefined()
  expect(await ui.find({ key: 'fold:open' })).toBeUndefined()
  expect(await texts(ui)).toEqual(expect.arrayContaining(['Activity', 'In this session · 1', 'Open · 29']))
  expect((await texts(ui)).some(t => t.startsWith('Session · '))).toBe(true)
  expect(await keys()).toEqual(expect.arrayContaining(['activity', 'divider', 'issues']))
  const activity = (await ui.findAll({ type: 'Box' })).find(b => b.key === 'activity')

  expect(activity?.props.width).toBe(47)
  expect(activity?.props.flexShrink).toBe(0)
  // 150 columns of 8px fit three 360px columns; every row is drawn, none cut.
  expect((await keys()).filter(k => k.startsWith('col:')).length).toBeGreaterThanOrEqual(3)
  expect((await issueKeys(ui)).length).toBe(30)
  expect(await ui.find({ key: 'build:7' })).toBeDefined()
  await ui.unmount()
})

test('wide: a building issue is a card in the Activity column, and untied agents are one line each there', async ($, on) => {
  stubs(on, { repos, depth: 3 })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(sized(ISSUES, ...WIDE))

  await ui.press({ key: 'build:7' })
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Look around', prompt: 'x' }))
  const boxes = await ui.findAll({ type: 'Box' })
  const keys = boxes.map(b => String(b.key))

  expect(keys).toContain('issue:7')
  expect(keys).toContain('agent:agent-2')
  expect(keys.indexOf('activity')).toBeLessThan(keys.indexOf('issue:7'))
  expect(keys.indexOf('issue:7')).toBeLessThan(keys.indexOf('divider'))
  expect(keys.indexOf('agent:agent-2')).toBeLessThan(keys.indexOf('divider'))
  expect(await texts(ui)).toContain('Look around')
  await ui.unmount()
})

test('wide: milestone groups are headers spanning the width', async ($, on) => {
  const ms = { title: 'v1', due_on: '2026-11-20T00:00:00Z', number: 1, open_issues: 1, closed_issues: 7 }

  stubs(on, { repos, gh: { exitCode: 0, stdout: many(6, { milestone: ms }), stderr: '' } })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(sized(ISSUES, ...WIDE))

  expect((await head(ui, 'fold:ms:v1'))).toContain('v1 ▾')
  expect((await ui.findAll({ type: 'Box' })).filter(b => String(b.key).startsWith('col:')).length).toBe(3)
  await ui.unmount()
})

test('narrow: title and the slot only', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(sized(ISSUES, ...NARROW))

  expect(await ui.find({ key: 'build:7' })).toBeDefined()
  expect(await texts(ui)).toContain('Add the thing')
  // Only the section arrows and the Main row's sprite and bar are drawn: no rings beside the issues.
  expect((await ui.findAll({ type: 'Svg' })).filter(s => !/, (open|folded)$|^main sprite$|^Main: /.test(String(s.props.alt))).length).toBe(0)
  expect((await texts(ui)).some(t => t.startsWith('session folder'))).toBe(false)
  await ui.unmount()
})

test('tall: an agent row has the meta line and a bar', async ($, on) => {
  await seed($, on)
  const ui = await $.ui.mount(sized(ISSUES, ...TALL))

  expect((await ui.findAll({ type: 'Svg' })).some(s => String(s.props.alt).startsWith('Write the thing'))).toBe(true)
  expect(await texts(ui)).toContain('coder')
  await ui.unmount()
})

test('narrow: an agent row is the title and its bar', async ($, on) => {
  await seed($, on)
  const ui = await $.ui.mount(sized(ISSUES, ...NARROW))
  const all = await texts(ui)

  expect(all).toContain('Write the thing')
  expect(all).not.toContain('coder')
  expect((await ui.findAll({ type: 'Svg' })).some(s => String(s.props.alt).startsWith('Write the thing'))).toBe(true)
  await ui.unmount()
})

test('the time of a finished agent runs from its own start to its end', async ($, on) => {
  const { clock } = stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'coder', description: 'Work', prompt: 'a' }))
  await clock.advance(12 * 60_000)
  await $.turn.complete(done('agent-1'))
  // Long after it ended, a redraw still shows the 12 minutes it ran.
  await clock.advance(30 * 60_000)
  const ui = await $.ui.mount(ISSUES)

  expect((await texts(ui)).some(t => t.endsWith('· 12:00'))).toBe(true)
  await ui.unmount()
})

test('the engine\'s own start time wins when it is earlier than the mod\'s note', async ($, on) => {
  const { clock } = stubs(on, {
    repos,
    agents: [
      {
        id: 'agent-1',
        description: 'Work',
        type: 'coder',
        status: 'completed',
        kind: 'local_agent',
        taskStatus: 'completed',
        label: '',
        startTime: 1_000_000 - 60_000,
        cwd: '/',
        model: 'claude-sonnet-5-5',
        tokenCount: 0,
        tokenSamples: [],
        hasRow: true,
      } as never,
    ],
  })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'coder', description: 'Work', prompt: 'a' }))
  await clock.advance(11 * 60_000)
  await $.turn.complete(done('agent-1'))
  const ui = await $.ui.mount(ISSUES)

  expect((await texts(ui)).some(t => t.endsWith('· 12:00'))).toBe(true)
  await ui.unmount()
})
