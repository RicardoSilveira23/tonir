import { expect, test } from 'claude-code/testing'

import { canStart, kindOf } from './issues'
import { done, ISSUES, issueKeys, loose, settle, startIn, stubs, texts, head } from './test-support'

const repos = { 'C:/Code/alpha': 'C:/Code/alpha' }
const STEP = 'mcp__tonir__step'

const many = (n: number) =>
  JSON.stringify(
    Array.from({ length: n }, (_, i) => ({
      number: i + 1,
      title: `Issue ${i + 1}`,
      html_url: `https://github.com/o/r/issues/${i + 1}`,
      updated_at: '2026-11-01T00:00:00Z',
      labels: [{ name: 'docs', color: '0075ca' }],
      user: { login: 'ana' },
      author_association: 'OWNER',
    })),
  )

const world = (count: number) => ({
  tree: { 'C:/Code': ['alpha', 'beta'] },
  gitDirs: ['C:/Code/alpha', 'C:/Code/beta'],
  ghBy: {
    'C:/Code/alpha': { exitCode: 0, stdout: many(count), stderr: '' },
    'C:/Code/beta': { exitCode: 0, stdout: many(2), stderr: '' },
  },
})

test('the header counts the open issues; the sections count Building, In this session and Open', async ($, on) => {
  stubs(on, { depth: 3, repos })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  expect((await texts(ui)).some(t => t.endsWith('· 3 open'))).toBe(true)
  expect(await texts(ui)).toEqual(expect.arrayContaining(['Open · 3 ▾']))

  await $.prompt.submit(loose({ text: 'see #9' }))
  expect(await texts(ui)).toEqual(expect.arrayContaining(['In this session · 1 ▾', 'Open · 2 ▾']))

  await ui.press({ key: 'build:7' })
  expect(await texts(ui)).toEqual(expect.arrayContaining(['Building · 1 ▾', 'In this session · 1 ▾', 'Open · 1 ▾']))

  await $.turn.complete(done('agent-1'))
  // The lead and its agents name #7, so it stays in this session, marked done.
  expect(await texts(ui)).toEqual(expect.arrayContaining(['In this session · 2 ▾', 'Open · 1 ▾', 'Done']))
  await ui.unmount()
})

test('a building row becomes a card with the stages, steps and the stage word; it ends back in a section', async ($, on) => {
  stubs(on, { depth: 3, repos })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  await ui.press({ key: 'build:7' })
  await $.agent.spawn(loose({ subagentType: 'coder', description: '#7 Work', prompt: 'seed' }))
  await $.tool.call({ tool: STEP, agentId: 'agent-2', done: 2, total: 5, note: 'tests' })

  const alts = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.alt))

  expect(alts).toContain('Pipeline: Build 2/5, step 2 of 4')
  expect(await ui.find({ key: 'build:7' })).toBeUndefined()

  await $.turn.complete(done('agent-1'))
  // Its coder still runs, so the issue is still being built.
  expect((await texts(ui)).includes('Done')).toBe(false)
  await $.turn.complete(done('agent-2'))
  expect((await texts(ui)).includes('Done')).toBe(true)
  await ui.unmount()
})

test('a failed build shows the note and can be built again', async ($, on) => {
  const { spawns } = stubs(on, { depth: 3, repos, spawnThrows: true })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)
  await ui.press({ key: 'build:7' })

  expect((await texts(ui)).some(t => t.includes('could not start'))).toBe(true)
  expect((await ui.find({ key: 'build:7' }))?.text).toBe('Retry')
  expect(spawns).toHaveLength(0)
  await ui.unmount()
})

test('the Open section shows 15 rows until Show all, and a section folds', async ($, on) => {
  stubs(on, world(20))
  await startIn($, 'C:/Code')
  const ui = await $.ui.mount(ISSUES)
  const rows = async (name: string) => (await issueKeys(ui)).filter(k => k.startsWith(`issue:${name}:`))

  // 22 issues in two repos: 15 shown, the rest behind Show all.
  expect(await issueKeys(ui)).toHaveLength(15)
  expect((await ui.find({ key: 'more:open' }))?.text).toBe('Show all 22')

  await ui.press({ key: 'more:open' })
  expect((await rows('alpha')).length + (await rows('beta')).length).toBe(22)
  expect((await ui.find({ key: 'more:open' }))?.text).toBe('Show fewer')

  await ui.press({ key: 'fold:open' })
  expect(await issueKeys(ui)).toHaveLength(0)
  expect((await head(ui, 'fold:open'))).toBe('Open · 22 ▸')

  await ui.press({ key: 'fold:open' })
  expect(await issueKeys(ui)).toHaveLength(22)
  await ui.unmount()
})

test('an empty Building and In this session are not drawn; an empty Open says so', async ($, on) => {
  stubs(on, { repos, gh: { exitCode: 0, stdout: '[]', stderr: '' } })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  expect(await texts(ui)).toEqual(expect.arrayContaining(['Open · 0 ▾', 'No open issues.']))
  expect((await texts(ui)).some(t => t.startsWith('Building'))).toBe(false)
  expect((await texts(ui)).some(t => t.startsWith('In this session'))).toBe(false)
  expect((await texts(ui)).some(t => t.startsWith('Other agents'))).toBe(false)
  await ui.unmount()
})

test('a row is the ring, the number, the title and the action', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)
  const alts = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.alt))

  expect(alts).toContain('#7 Add the thing, bug')
  expect((await texts(ui)).includes('Add the thing')).toBe(true)
  expect((await ui.find({ key: 'build:7' }))?.text).toBe('Build')
  await ui.unmount()
})

test('kinds and the stuck-queue rule', () => {
  expect(kindOf([{ name: 'bug' }])).toBe('bug')
  expect(kindOf([{ name: 'enhancement' }])).toBe('feature')
  expect(kindOf([{ name: 'documentation' }])).toBe('docs')
  expect(kindOf([{ name: 'question' }])).toBe('other')

  const build = { stage: 'queued', startedAt: 0 } as never

  expect(canStart(build, 119_000)).toBe(false)
  expect(canStart(build, 121_000)).toBe(true)
  expect(canStart({ stage: 'failed', startedAt: 0 } as never, 1)).toBe(true)
  expect(canStart({ stage: 'building', startedAt: 0 } as never, 10_000_000)).toBe(false)
  expect(canStart(undefined, 0)).toBe(true)
})

test('on a terminal the pane is plain text with a search field and a Build button per row', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount({ ...ISSUES, surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: 'alpha' }))?.text).toBe('alpha')
  expect(await ui.find({ key: 'search' })).toBeDefined()
  expect(await ui.find({ key: 'build:7' })).toBeDefined()
  await ui.unmount()
})
