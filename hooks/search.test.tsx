import { expect, test } from 'claude-code/testing'

import { done, ISSUES, issueKeys, loose, startIn, stubs, texts, head } from './test-support'

// The search filters after a short pause: the mocked clock moves past it.
let clock = { advance: async (_ms: number) => {} }

const setup = (on: Parameters<typeof stubs>[0], options: Parameters<typeof stubs>[1] = {}) => {
  const made = stubs(on, options)

  clock = made.clock

  return made
}

const repos = { 'C:/Code/alpha': 'C:/Code/alpha' }

const issue = (number: number, title: string, label: string, login: string, extra: object = {}) => ({
  number,
  title,
  html_url: `https://github.com/o/r/issues/${number}`,
  updated_at: `2026-11-0${9 - (number % 9)}T00:00:00Z`,
  labels: [{ name: label, color: 'ffffff' }],
  user: { login },
  author_association: 'OWNER',
  ...extra,
})

const gh = {
  exitCode: 0,
  stdout: JSON.stringify([
    issue(75, 'Fix chart labels', 'bug', 'ana'),
    issue(84, 'Make the status page readable', 'enhancement', 'bruno'),
    issue(86, 'Show device classes', 'docs', 'ana'),
  ]),
  stderr: '',
}

const search = async (ui: { input: (a: never) => Promise<unknown> }, text: string) => {
  await ui.input({ key: 'search', text } as never)
  await clock.advance(200)
}

test('the sections show Building, In this session and Open with their counts', async ($, on) => {
  setup(on, { repos, depth: 3, gh })
  await startIn($, 'C:/Code/alpha')
  await $.prompt.submit(loose({ text: 'look at #84' }))
  const ui = await $.ui.mount(ISSUES)

  expect(await texts(ui)).toEqual(expect.arrayContaining(['In this session · 1 ▾', 'Open · 2 ▾']))
  await ui.press({ key: 'build:75' })
  expect(await texts(ui)).toEqual(expect.arrayContaining(['Building · 1 ▾', 'In this session · 1 ▾', 'Open · 1 ▾']))
  expect(await issueKeys(ui)).toEqual(['issue:75', 'issue:84', 'issue:86'])
  await ui.unmount()
})

test('the building card shows the stages and the crew of seeded agents', async ($, on) => {
  setup(on, { repos, depth: 3, gh })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  await ui.press({ key: 'build:75' })
  await $.agent.spawn(loose({ subagentType: 'coder', model: 'sonnet', description: '#75 Fix chart labels', prompt: 'a' }))
  await $.tool.call({ tool: 'mcp__tonir__step', agentId: 'agent-2', done: 3, total: 5, note: 'updating tests' })
  const stages = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.alt))

  expect(stages).toContain('Pipeline: Build 3/5, step 2 of 4')
  // The sprite is the newest running agent's.
  expect(stages).toContain('coder sprite')
  expect(stages).not.toContain('lead sprite')
  const all = await texts(ui)

  expect(all).toContain('lead')
  expect(all).toContain('coder')
  expect(all.some(t => t.startsWith('lead · ') && t.includes('waiting on coder'))).toBe(true)
  expect(all.some(t => t.startsWith('coder · ') && t.includes('3/5 updating tests'))).toBe(true)
  await ui.unmount()
})

test('search by #75, by 75, by a title word, by a label and by author, and clearing restores all', async ($, on) => {
  setup(on, { repos, gh })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  await search(ui, '#75')
  expect(await issueKeys(ui)).toEqual(['issue:75'])
  expect(await texts(ui)).toContain('Open · 1 ▾')

  await search(ui, '75')
  expect(await issueKeys(ui)).toEqual(['issue:75'])

  await search(ui, 'READABLE')
  expect(await issueKeys(ui)).toEqual(['issue:84'])

  await search(ui, 'enhancement')
  expect(await issueKeys(ui)).toEqual(['issue:84'])

  await search(ui, 'ana')
  expect((await issueKeys(ui)).sort()).toEqual(['issue:75', 'issue:86'])

  await search(ui, 'ana chart')
  expect(await issueKeys(ui)).toEqual(['issue:75'])

  await search(ui, 'zzz')
  expect(await issueKeys(ui)).toEqual([])
  expect(await texts(ui)).toContain('No issues match.')

  await search(ui, '')
  expect((await issueKeys(ui)).sort()).toEqual(['issue:75', 'issue:84', 'issue:86'])
  await ui.unmount()
})

test('search keeps the sections and counts the matches', async ($, on) => {
  setup(on, { repos, gh })
  await startIn($, 'C:/Code/alpha')
  await $.prompt.submit(loose({ text: 'see #75' }))
  const ui = await $.ui.mount(ISSUES)

  await search(ui, 'ana')
  expect(await texts(ui)).toEqual(expect.arrayContaining(['In this session · 1 ▾', 'Open · 1 ▾']))
  await search(ui, 'bruno')
  expect(await texts(ui)).toEqual(expect.arrayContaining(['Open · 1 ▾']))
  await ui.unmount()
})

test('search spans every repo shown', async ($, on) => {
  setup(on, {
    tree: { 'C:/Code': ['alpha', 'beta'] },
    gitDirs: ['C:/Code/alpha', 'C:/Code/beta'],
    ghBy: {
      'C:/Code/alpha': { exitCode: 0, stdout: JSON.stringify([issue(1, 'Alpha chart', 'bug', 'ana')]), stderr: '' },
      'C:/Code/beta': { exitCode: 0, stdout: JSON.stringify([issue(1, 'Beta chart', 'bug', 'ana'), issue(2, 'Beta other', 'bug', 'ana')]), stderr: '' },
    },
  })
  await startIn($, 'C:/Code')
  const ui = await $.ui.mount(ISSUES)

  await search(ui, 'chart')
  expect((await issueKeys(ui)).sort()).toEqual(['issue:alpha:1', 'issue:beta:1'])
  await search(ui, '#2')
  expect(await issueKeys(ui)).toEqual(['issue:beta:2'])
  await ui.unmount()
})

test('the search is kept in the session and survives a remount', async ($, on) => {
  setup(on, { repos, gh })
  await startIn($, 'C:/Code/alpha')
  const first = await $.ui.mount(ISSUES)

  await search(first, 'chart')
  await first.unmount()
  const again = await $.ui.mount(ISSUES)

  expect(await issueKeys(again)).toEqual(['issue:75'])
  await again.unmount()
})

test('five quick change events leave the field alone and the filter reads chart after the pause', async ($, on) => {
  setup(on, { repos, gh })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  for (const text of ['c', 'ch', 'cha', 'char', 'chart']) await ui.input({ key: 'search', text, kind: 'change' } as never)
  // Nothing is written back into the field, and the filter waits for the pause.
  expect((await ui.find({ key: 'search' }))?.props.value).toBeUndefined()
  expect(await issueKeys(ui)).toHaveLength(3)
  await clock.advance(100)
  expect(await issueKeys(ui)).toHaveLength(3)
  await clock.advance(100)
  expect(await issueKeys(ui)).toEqual(['issue:75'])
  expect((await ui.find({ key: 'search' }))?.props.value).toBeUndefined()
  await ui.unmount()
})

const withMilestone = (n: number, title: string, milestone: object | null) => ({
  number: n,
  title,
  html_url: `https://github.com/o/r/issues/${n}`,
  updated_at: `2026-11-0${9 - (n % 9)}T00:00:00Z`,
  labels: [],
  user: { login: 'ana' },
  author_association: 'OWNER',
  milestone,
})

test('with milestones the Open section is one group per milestone by due date, none last, with progress', async ($, on) => {
  const later = { title: 'v2', due_on: '2026-12-01T00:00:00Z', number: 2, open_issues: 5, closed_issues: 3 }
  const sooner = { title: 'v1', due_on: '2026-11-20T00:00:00Z', number: 1, open_issues: 1, closed_issues: 7 }
  const undated = { title: 'Someday', due_on: null, number: 3, open_issues: 2, closed_issues: 0 }

  setup(on, {
    repos,
    gh: {
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify([withMilestone(1, 'Plain', null), withMilestone(2, 'Later', later), withMilestone(3, 'Soon', sooner), withMilestone(4, 'Soon too', sooner), withMilestone(5, 'Later-day', undated)]),
    },
  })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)
  const groups = async () => (await ui.findAll({ type: 'Box' })).map(b => String(b.key)).filter(k => k.startsWith('milestone:'))

  expect(await groups()).toEqual(['milestone:v1', 'milestone:v2', 'milestone:Someday', 'milestone:none'])
  expect(await texts(ui)).toEqual(expect.arrayContaining(['v1 ▾', ' · 7 of 8 closed', ' · 3 of 8 closed', 'No milestone · 1 ▾', 'Open · 5 ▾']))

  // Search filters within the groups.
  await search(ui, 'later')
  expect(await groups()).toEqual(['milestone:v2', 'milestone:Someday'])
  expect(await texts(ui)).toContain('Open · 2 ▾')
  await ui.unmount()
})

test('a milestone group folds, keeps its header, and a search unfolds a matching one', async ($, on) => {
  const ms = { title: 'v1', due_on: '2026-11-20T00:00:00Z', number: 1, open_issues: 1, closed_issues: 7 }

  setup(on, {
    repos,
    gh: { exitCode: 0, stderr: '', stdout: JSON.stringify([withMilestone(1, 'Plain', null), withMilestone(3, 'Soon', ms), withMilestone(4, 'Soon too', ms)]) },
  })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  await ui.press({ key: 'fold:ms:v1' })
  expect(await issueKeys(ui)).toEqual(['issue:1'])
  expect((await head(ui, 'fold:ms:v1'))).toContain('v1 ▸')
  expect(await texts(ui)).toContain('Open · 3 ▾')

  await ui.press({ key: 'fold:ms:none' })
  expect(await issueKeys(ui)).toEqual([])
  expect((await head(ui, 'fold:ms:none'))).toContain('No milestone · 1 ▸')

  await search(ui, 'soon')
  expect((await issueKeys(ui)).sort()).toEqual(['issue:3', 'issue:4'])
  expect((await head(ui, 'fold:ms:v1'))).toContain('v1 ▾')
  await ui.unmount()
})

test('with no milestones the Open list is flat', async ($, on) => {
  setup(on, { repos, gh })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  expect((await ui.findAll({ type: 'Box' })).some(b => String(b.key).startsWith('milestone:'))).toBe(false)
  expect(await issueKeys(ui)).toHaveLength(3)
  await ui.unmount()
})

const agent = (id: string, type: string, description: string, status: string) => ({
  id,
  description,
  type,
  status,
  kind: 'local_agent',
  taskStatus: status === 'completed' ? 'completed' : 'running',
  label: '',
  startTime: 1_000_000,
  cwd: '/',
  model: 'claude-opus-5-5',
  tokenCount: 0,
  tokenSamples: [],
  hasRow: true,
})

test('agents that name an issue make it Building with the crew and stage; when they end it is In this session, marked', async ($, on) => {
  const gh76 = { exitCode: 0, stderr: '', stdout: JSON.stringify([issue(76, 'Stack figures tables', 'bug', 'ana'), issue(77, 'Other', 'bug', 'ana')]) }
  const agents = [
    agent('a1', 'coder', 'Stack figures tables, fix nits #76', 'completed'),
    agent('a2', 'validator', 'Re-validate #76 after fixes', 'running'),
  ]

  setup(on, { repos, gh: gh76, agents: agents as never })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  expect(await texts(ui)).toEqual(expect.arrayContaining(['Building · 1 ▾', 'Open · 1 ▾']))
  const alts = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.alt))

  expect(alts).toContain('Pipeline: Review, step 4 of 4')
  expect(alts).toContain('validator sprite')
  await ui.unmount()
})

test('once the agents of an issue are done it moves to In this session with a done mark', async ($, on) => {
  const gh76 = { exitCode: 0, stderr: '', stdout: JSON.stringify([issue(76, 'Stack figures tables', 'bug', 'ana')]) }

  const made = setup(on, { repos, gh: gh76 })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'validator', description: 'Re-validate #76 after fixes', prompt: 'b' }))
  const ui = await $.ui.mount(ISSUES)

  expect(await texts(ui)).toContain('Building · 1 ▾')
  await $.turn.complete(done('agent-1'))
  expect(made.registered).toBeDefined()
  expect(await texts(ui)).toEqual(expect.arrayContaining(['In this session · 1 ▾']))
  expect(await texts(ui)).toContain('Done')
  await ui.unmount()
})

test('every toggle starts open, folds exactly its own group on a press and opens again on the next', async ($, on) => {
  const v1 = { title: 'v1', due_on: '2026-11-20T00:00:00Z', number: 1, open_issues: 1, closed_issues: 7 }
  const v2 = { title: 'v2', due_on: '2026-12-20T00:00:00Z', number: 2, open_issues: 4, closed_issues: 0 }

  setup(on, {
    repos,
    gh: {
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify([withMilestone(1, 'One', v1), withMilestone(2, 'Two', v2), withMilestone(3, 'Three', null)]),
    },
  })
  await startIn($, 'C:/Code/alpha')
  await $.prompt.submit(loose({ text: 'see #3' }))
  const ui = await $.ui.mount(ISSUES)
  const label = async (key: string) => head(ui, key)
  const toggles = ['fold:session', 'fold:open', 'fold:ms:v1', 'fold:ms:v2']

  // Everything starts open.
  for (const key of toggles) expect(await label(key)).toContain('▾')

  for (const key of toggles) {
    // Folding Open hides the milestone toggles inside it.
    const others = toggles.filter(k => k !== key && !(key === 'fold:open' && k.startsWith('fold:ms:')))

    await ui.press({ key })
    expect(await label(key)).toContain('▸')
    for (const other of others) expect(await label(other)).toContain('▾')
    await ui.press({ key })
    expect(await label(key)).toContain('▾')
  }

  // Folding one milestone hides only its rows.
  await ui.press({ key: 'fold:ms:v1' })
  expect((await issueKeys(ui)).sort()).toEqual(['issue:2', 'issue:3'])
  await ui.unmount()
})

test('a milestone line sits one step in under Open; its rows stay level with every other row', async ($, on) => {
  const v1 = { title: 'v1', due_on: '2026-11-20T00:00:00Z', number: 1, open_issues: 1, closed_issues: 7 }

  setup(on, { repos, gh: { exitCode: 0, stderr: '', stdout: JSON.stringify([withMilestone(1, 'One', v1)]) } })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)
  const boxes = await ui.findAll({ type: 'Box' })

  expect(boxes.find(b => b.key === 'milestone-line:v1')?.props.paddingLeft).toBe(1)
  expect(boxes.find(b => b.key === 'milestone:v1')?.props.paddingLeft).toBeUndefined()
  expect(boxes.find(b => b.key === 'rows:v1')?.props.paddingLeft).toBeUndefined()
  expect(boxes.find(b => b.key === 'section:open')?.props.paddingLeft).toBeUndefined()
  await ui.unmount()
})
