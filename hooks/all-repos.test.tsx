import { expect, test } from 'claude-code/testing'

import { ISSUES, issueKeys, loose, settle, startIn, stubs, texts, head } from './test-support'

const issueJson = (n: number, title: string) =>
  JSON.stringify([{ number: n, title, html_url: `https://github.com/o/r/issues/${n}`, updated_at: '2026-11-05T00:00:00Z', labels: [], user: { login: 'ana' }, author_association: 'OWNER' }])

// A C:/Code-like folder: two repos, one in personal/, one in a blocked folder, and one that gh cannot list.
const world = () => ({
  repos: { 'C:/Code/beta/lib': 'C:/Code/beta' } as Record<string, string>,
  tree: {
    'C:/Code': ['alpha', 'beta', 'Vault', 'personal', 'docs'],
    'C:/Code/personal': ['gamma'],
  },
  gitDirs: ['C:/Code/alpha', 'C:/Code/beta', 'C:/Code/Vault', 'C:/Code/personal/gamma'],
  ghBy: {
    'C:/Code/beta': { exitCode: 0, stdout: issueJson(3, 'Beta thing'), stderr: '' },
    'C:/Code/personal/gamma': { exitCode: 1, stdout: '', stderr: 'no github remote' },
  },
})

test('a folder that is not a repo lists the issues of every repo under it, and never reads a blocked folder', { options: { blockedFolders: 'vault' } }, async ($, on) => {
  const { touched, ghCalls } = stubs(on, world())
  await startIn($, 'C:/Code')
  const ui = await $.ui.mount(ISSUES)
  const all = await issueKeys(ui)

  expect(all).toContain('issue:alpha:7')
  expect(all).toContain('issue:beta:3')
  expect(all.some(k => k.includes('gamma'))).toBe(false)
  expect((await texts(ui)).some(t => t.startsWith('all repos under C:/Code'))).toBe(true)
  expect((await ui.find({ type: 'Text', text: /without issues or remote/ }))?.text).toBe('1 repo without issues or remote')
  expect([...ghCalls].sort()).toEqual(['C:/Code/alpha', 'C:/Code/beta', 'C:/Code/personal/gamma'])
  expect(touched.some(t => t.toLowerCase().includes('vault'))).toBe(false)
  expect(await ui.find({ key: 'build:beta:3' })).toBeDefined()
  await ui.unmount()
})

test('a #n in a prompt puts that issue in the session section, marked', async ($, on) => {
  stubs(on, world())
  await startIn($, 'C:/Code')
  await $.prompt.submit(loose({ text: 'look at #3' }))
  const ui = await $.ui.mount(ISSUES)

  expect((await issueKeys(ui))[0]).toBe('issue:beta:3')
  expect(await texts(ui)).toContain('In this session · 1 ▾')
  await ui.unmount()
})

test('picking a repo in the Select narrows to it and pins it against touched files', async ($, on) => {
  const { ghCalls } = stubs(on, world())
  await startIn($, 'C:/Code')
  const first = await $.ui.mount(ISSUES)
  await first.select({ key: 'repo', value: 'C:/Code/beta' })
  await first.unmount()

  const pinned = await $.ui.mount(ISSUES)
  // The picker says what is pinned; "All repos" in it unpins. No chip, no "pinned" beside the name.
  expect((await pinned.find({ key: 'repo' }))?.props.value).toBe('C:/Code/beta')
  expect(await pinned.find({ key: 'unpin' })).toBeUndefined()
  expect((await texts(pinned)).some(t => t.startsWith('pinned'))).toBe(false)
  expect(await texts(pinned)).toContain('beta')
  expect(await issueKeys(pinned)).toEqual(['issue:3'])
  await pinned.unmount()

  // A file in another repo does not move a pinned pick.
  ghCalls.length = 0
  await $.tool.call(loose<never>({ tool: 'Read', file_path: 'C:/Code/alpha/src/a.ts' }))
  await settle()
  expect(ghCalls).toEqual([])
  const still = await $.ui.mount(ISSUES)
  expect((await still.find({ key: 'repo' }))?.props.value).toBe('C:/Code/beta')

  // Back to all repos.
  await still.select({ key: 'repo', value: '' })
  await still.unmount()
  const back = await $.ui.mount(ISSUES)
  expect((await issueKeys(back)).some(k => k.startsWith('issue:alpha:'))).toBe(true)
  await back.unmount()
})

test('with nothing pinned, a touched file picks its repo as files in use', async ($, on) => {
  stubs(on, world())
  await startIn($, 'C:/Code')
  await $.tool.call(loose<never>({ tool: 'Edit', file_path: 'C:/Code/beta/lib/a.ts', old_string: 'a', new_string: 'b' }))
  await settle()
  const ui = await $.ui.mount(ISSUES)

  expect((await texts(ui)).some(t => t.startsWith('files in use'))).toBe(true)
  expect((await issueKeys(ui)).some(k => k.includes('alpha'))).toBe(false)
  expect(await ui.find({ key: 'repo' })).toBeDefined()
  await ui.unmount()
})

test('a pinned repo keeps the picker with its value in every layout, and All repos unpins it', async ($, on) => {
  stubs(on, world())
  await startIn($, 'C:/Code')
  const first = await $.ui.mount(ISSUES)

  await first.select({ key: 'repo', value: 'C:/Code/beta' })
  await first.unmount()

  const sized = (columns: number, rows: number) => ({ ...ISSUES, props: { ...ISSUES.props, bodyColumns: columns, scroll: { offset: 0, bodyRows: rows } } })

  for (const [columns, rows] of [[60, 30], [150, 14], [30, 30]] as const) {
    const ui = await $.ui.mount(sized(columns, rows))

    expect((await ui.find({ key: 'repo' }))?.props.value).toBe('C:/Code/beta')
    expect(await ui.find({ key: 'unpin' })).toBeUndefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount(ISSUES)

  expect(await issueKeys(ui)).toEqual(['issue:3'])
  await ui.select({ key: 'repo', value: '' })
  expect((await issueKeys(ui)).some(k => k.startsWith('issue:alpha:'))).toBe(true)
  expect((await ui.find({ key: 'repo' }))?.props.value).toBe('')
  expect(await ui.find({ key: 'unpin' })).toBeUndefined()
  await ui.unmount()
})

const row = (n: number, title: string, milestone: object | null) => ({
  number: n,
  title,
  html_url: `https://github.com/o/r/issues/${n}`,
  updated_at: `2026-11-0${(n % 8) + 1}T00:00:00Z`,
  labels: [],
  user: { login: 'ana' },
  author_association: 'OWNER',
  milestone,
})

const grouped = () => {
  const v1 = { title: 'v1', due_on: '2026-11-20T00:00:00Z', number: 1, open_issues: 2, closed_issues: 1 }

  return {
    tree: { 'C:/Code': ['alpha', 'beta'] },
    gitDirs: ['C:/Code/alpha', 'C:/Code/beta'],
    ghBy: {
      'C:/Code/alpha': { exitCode: 0, stderr: '', stdout: JSON.stringify([row(1, 'A1', v1), row(2, 'A2', v1), row(3, 'A3', null), row(4, 'A4', null), row(5, 'A5', null)]) },
      'C:/Code/beta': { exitCode: 0, stderr: '', stdout: JSON.stringify([row(1, 'B1', null), row(2, 'B2', null)]) },
    },
  }
}

const boxKeys = async (ui: { findAll: (q: never) => Promise<readonly { key?: unknown }[]> }) =>
  (await ui.findAll({ type: 'Box' } as never)).map(b => String(b.key))

test('all repos: Open is one group per repo, the busiest first, with the milestones of each inside it, each line a step in', async ($, on) => {
  stubs(on, grouped())
  await startIn($, 'C:/Code')
  const ui = await $.ui.mount(ISSUES)
  const keys = await boxKeys(ui)
  const boxes = await ui.findAll({ type: 'Box' })

  expect(keys.filter(k => k.startsWith('repo:'))).toEqual(['repo:alpha', 'repo:beta'])
  expect(keys.filter(k => k.startsWith('milestone:'))).toEqual(['milestone:alpha:v1', 'milestone:alpha:none'])
  expect(await texts(ui)).toEqual(expect.arrayContaining(['alpha · 5 ▾', 'beta · 2 ▾', 'v1 ▾', 'No milestone · 3 ▾']))
  // Beta has no milestones: its rows sit straight under its header.
  expect(keys).toContain('rows:beta:')
  expect(boxes.find(b => b.key === 'repo:alpha')?.props.paddingLeft).toBe(2)
  expect(boxes.find(b => b.key === 'milestone-line:alpha:v1')?.props.paddingLeft).toBe(1)
  expect(boxes.find(b => b.key === 'rows:alpha:v1')?.props.paddingLeft).toBeUndefined()
  // The repo is the group header: no repo name on the rows.
  expect(await texts(ui)).not.toContain('alpha')
  expect(await texts(ui)).not.toContain('beta')
  await ui.unmount()
})

test('all repos: a repo group folds; folded Open hides every repo, milestone and row, and the chevron matches', async ($, on) => {
  stubs(on, grouped())
  await startIn($, 'C:/Code')
  const ui = await $.ui.mount(ISSUES)

  await ui.press({ key: 'fold:repo:beta' })
  expect((await issueKeys(ui)).some(k => k.includes('beta'))).toBe(false)
  expect((await head(ui, 'fold:repo:beta'))).toContain('beta · 2 ▸')
  expect((await issueKeys(ui)).some(k => k.includes('alpha'))).toBe(true)
  await ui.press({ key: 'fold:repo:beta' })

  // A milestone folded first, then the whole section: nothing of it is drawn.
  await ui.press({ key: 'fold:ms:alpha:v1' })
  await ui.press({ key: 'fold:open' })
  const keys = await boxKeys(ui)

  expect(keys.some(k => k.startsWith('repo:') || k.startsWith('milestone:') || k.startsWith('rows:') || k.startsWith('issue:'))).toBe(false)
  expect((await head(ui, 'fold:open'))).toBe('Open · 7 ▸')
  expect(await ui.find({ key: 'fold:repo:alpha' })).toBeUndefined()

  await ui.press({ key: 'fold:open' })
  expect((await head(ui, 'fold:open'))).toBe('Open · 7 ▾')
  expect((await head(ui, 'fold:repo:alpha'))).toContain('alpha · 5 ▾')
  expect((await head(ui, 'fold:ms:alpha:v1'))).toContain('v1 ▸')
  await ui.unmount()
})

test('a row is one line: its slot Box has the one width and no border, height or padding of its own', async ($, on) => {
  stubs(on, { repos: { 'C:/Code/alpha': 'C:/Code/alpha' } })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)
  const boxes = await ui.findAll({ type: 'Box' })
  const slot = boxes.find(b => b.key === 'slot')

  expect(slot?.props.width).toBe(13)
  expect(slot?.props.height).toBeUndefined()
  expect(slot?.props.borderStyle).toBeUndefined()
  expect(slot?.props.paddingY).toBeUndefined()
  expect(boxes.filter(b => b.props.height !== undefined && String(b.key).startsWith('issue:'))).toHaveLength(0)
  expect((await ui.find({ key: 'build:7' }))?.props.variant).not.toBe('primary')
  await ui.unmount()
})
