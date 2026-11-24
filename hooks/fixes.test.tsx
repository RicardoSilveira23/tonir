import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { pipelineSvg } from './look'
import { done, ISSUES, issueKeys, loose, startIn, stubs, texts } from './test-support'

const repos = { 'C:/Code/alpha': 'C:/Code/alpha' }
const BAR = { plugin: 'tonir', surface: 'desktop', component: 'AbovePrompt', props: {} } as const

const many = (n: number) =>
  JSON.stringify(
    Array.from({ length: n }, (_, i) => ({
      number: i + 1,
      title: `Issue ${i + 1}`,
      html_url: `https://github.com/o/r/issues/${i + 1}`,
      updated_at: '2026-11-01T00:00:00Z',
      labels: [],
      user: { login: 'ana' },
      author_association: 'OWNER',
    })),
  )

const world = {
  tree: { 'C:/Code': ['alpha', 'beta'] },
  gitDirs: ['C:/Code/alpha', 'C:/Code/beta'],
  ghBy: {
    'C:/Code/alpha': { exitCode: 0, stdout: many(20), stderr: '' },
    'C:/Code/beta': { exitCode: 0, stdout: many(2), stderr: '' },
  },
}

test('chevrons are ▾ open and ▸ folded, after the name', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  expect(await texts(ui)).toContain('Open · 3 ▾')
  await ui.press({ key: 'fold:open' })
  expect(await texts(ui)).toContain('Open · 3 ▸')
  expect((await texts(ui)).some(t => /[⌄›]/.test(t))).toBe(false)
  await ui.unmount()
})

test('a header and the rows under it share one left edge: neither is inset by us', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)
  const boxes = await ui.findAll({ type: 'Box' })
  const flush = boxes.filter(b => b.key === 'section:open' || String(b.key).startsWith('issue:'))

  expect(flush.length).toBeGreaterThan(3)
  for (const b of flush) {
    for (const prop of ['paddingLeft', 'paddingX', 'padding', 'marginLeft', 'marginX', 'margin', 'left']) expect(b.props[prop]).toBeUndefined()
  }
  const header = await ui.find({ key: 'fold:open' })

  expect(header?.props.plain).toBe(true)
  expect(header?.props.dimColor).toBe(true)
  await ui.unmount()
})

test('a pinned repo shows no "pinned" text or chip, and the search field has no glyph beside it', async ($, on) => {
  stubs(on, world)
  await startIn($, 'C:/Code')
  const first = await $.ui.mount(ISSUES)

  await first.select({ key: 'repo', value: 'C:/Code/beta' })
  await first.unmount()
  const ui = await $.ui.mount(ISSUES)
  const all = await texts(ui)

  expect(await ui.find({ key: 'unpin' })).toBeUndefined()
  expect(all.filter(t => t.includes('pinned'))).toHaveLength(0)
  expect(all.some(t => t.includes('⌕'))).toBe(false)
  expect((await ui.find({ key: 'search' }))?.props.label).toBeUndefined()
  await ui.unmount()
})

test('empty Building, In this session and Other agents are not drawn; Open always is', async ($, on) => {
  stubs(on, { repos, gh: { exitCode: 0, stdout: '[]', stderr: '' } })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)
  const all = await texts(ui)

  for (const name of ['Building', 'In this session', 'Other agents']) expect(all.some(t => t.startsWith(name))).toBe(false)
  expect(all).toContain('Open · 0 ▾')
  await ui.unmount()
})

test('an agent resumed for a new round shows once, with round 2 and the totals of both rounds', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  const usage = { model: 'claude-sonnet-5-5', input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

  await $.agent.spawn(loose({ subagentType: 'coder', model: 'claude-sonnet-5-5', description: 'Fix it', prompt: 'a' }))
  await $.turn.complete({ ...done('agent-1'), usage })
  await $.agent.spawn(loose({ subagentType: 'coder', model: 'claude-sonnet-5-5', description: 'Fix it', prompt: 'b' }))
  await $.turn.complete({ ...done('agent-2'), usage })
  const ui = await $.ui.mount(ISSUES)
  const all = await texts(ui)

  expect(all).toContain('Other agents · 1 ▾')
  expect(all.filter(t => t === 'Fix it')).toHaveLength(1)
  expect(all.some(t => t.startsWith('coder · ') && t.includes('round 2') && t.includes('≈$4.00'))).toBe(true)
  expect((await ui.findAll({ type: 'Box' })).filter(b => String(b.key).startsWith('agent:') && b.key !== 'agent:main')).toHaveLength(1)
  await ui.unmount()
})

test('Show all appears only under a list that is cut, never under folded groups', async ($, on) => {
  stubs(on, world)
  await startIn($, 'C:/Code')
  const ui = await $.ui.mount(ISSUES)

  expect(await ui.find({ key: 'more:open' })).toBeDefined()
  await ui.press({ key: 'fold:repo:alpha' })
  await ui.press({ key: 'fold:repo:beta' })
  expect(await issueKeys(ui)).toHaveLength(0)
  expect(await ui.find({ key: 'more:open' })).toBeUndefined()
  await ui.press({ key: 'fold:repo:alpha' })
  // alpha's 20 rows are cut at 15 again: Show all is back.
  expect((await ui.find({ key: 'more:open' }))?.text).toBe('Show all 22')
  await ui.unmount()
})

test('folds start open and are kept once the person sets them', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  const first = await $.ui.mount(ISSUES)

  expect(await texts(first)).toContain('Open · 3 ▾')
  await first.press({ key: 'fold:open' })
  await first.unmount()
  const again = await $.ui.mount(ISSUES)

  expect(await texts(again)).toContain('Open · 3 ▸')
  await again.unmount()
})

const runningAgent = async ($: Engine, desc: string) => {
  await $.agent.spawn(loose({ subagentType: 'coder', model: 'claude-sonnet-5-5', description: desc, prompt: 'a' }))
}

test('the bar mirrors the pane: a building issue, else the running agent, else the repo', { options: { openBar: 'on' } }, async ($, on) => {
  stubs(on, { repos, depth: 3 })
  await startIn($, 'C:/Code/alpha')

  // Idle: the repo, muted.
  const idle = await $.ui.mount(BAR as never)

  expect((await texts(idle as never)).includes('alpha')).toBe(true)
  expect((await idle.findAll({ type: 'Svg' })).length).toBe(0)
  await idle.unmount()

  // An agent that belongs to no issue runs: its sprite, title, step, bar and a +N for the others.
  await runningAgent($, 'Write the thing')
  await $.tool.call({ tool: 'mcp__tonir__step', agentId: 'agent-1', done: 2, total: 5, note: 'tests' })
  await runningAgent($, 'Second job')
  const agent = await $.ui.mount(BAR as never)
  const said = await texts(agent as never)
  const svgs = await agent.findAll({ type: 'Svg' })
  const paneRow = await $.ui.mount(ISSUES)
  const paneBar = (await paneRow.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('Second job'))
  const barSource = String(svgs.find(s => String(s.props.alt).startsWith('Second job'))?.props.source)

  expect(said).toEqual(expect.arrayContaining(['Second job', 'starting…', '+1']))
  expect(svgs.some(s => s.props.alt === 'coder sprite' && s.props.width === 16 && String(s.props.source).includes('class="hop"'))).toBe(true)
  expect(barSource).toContain('height="3"')
  expect(barSource).toContain('#e0a15a')
  expect(paneBar).toBeDefined()
  expect(said).not.toContain('alpha')
  await paneRow.unmount()
  await agent.unmount()

  // An issue builds: it wins over the agents.
  const issues = await $.ui.mount(ISSUES)

  await issues.press({ key: 'build:7' })
  await issues.unmount()
  const building = await $.ui.mount(BAR as never)

  expect((await texts(building as never)).includes('#7')).toBe(true)
  expect((await building.findAll({ type: 'Svg' })).some(s => String(s.props.source) === pipelineSvg(96, 0) || String(s.props.alt).startsWith('Pipeline:'))).toBe(true)
  await building.unmount()
})
