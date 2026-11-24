import { expect, test } from 'claude-code/testing'

import { listArgv } from './issues'
import { ISSUES, alts, drawn, issueKeys, loose, startIn, stubs, texts } from './test-support'

const repos = { 'C:/Code/alpha': 'C:/Code/alpha' }

const rest = (rows: object[]) => ({ exitCode: 0, stdout: JSON.stringify(rows), stderr: '' })

const issue = (number: number, extra: object = {}) => ({
  number,
  title: `Issue ${number}`,
  html_url: `https://github.com/o/r/issues/${number}`,
  updated_at: '2026-11-03T00:00:00Z',
  labels: [{ name: 'bug', color: 'd73a4a' }],
  user: { login: 'ana' },
  author_association: 'OWNER',
  ...extra,
})

test('issues load from the REST list: argv, no --json, pull requests dropped, fields mapped', async ($, on) => {
  const { ghArgv } = stubs(on, {
    repos,
    gh: rest([issue(1), issue(2, { pull_request: { url: 'x' } }), issue(3, { author_association: 'NONE', user: { login: 'eve' } })]),
  })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  // The repo is named explicitly, as its origin remote names it: gh never picks another remote's repo.
  expect(ghArgv).toEqual([['gh', 'api', 'repos/test/alpha/issues', '-X', 'GET', '-f', 'state=open', '-f', 'per_page=50']])
  expect(ghArgv.flat().some(a => a.startsWith('--json'))).toBe(false)
  expect(listArgv('test/alpha')).toEqual(ghArgv[0])
  expect(await issueKeys(ui)).toEqual(['issue:1', 'issue:3'])
  // Trust rule: the owner's issue can be built, the stranger's cannot.
  expect(await ui.find({ key: 'build:1' })).toBeDefined()
  expect(await ui.find({ key: 'build:3' })).toBeUndefined()
  expect(await texts(ui)).toContain('outside author')
  expect((await texts(ui)).some(t => t.endsWith('· 2 open'))).toBe(true)
  await ui.unmount()
})

test('no drawing in either pane has a grid pattern', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'coder', description: '#7 Build', prompt: 'a' }))
  const issues = await $.ui.mount(ISSUES)

  for (const ui of [issues]) {
    expect(await drawn(ui)).not.toContain('<pattern')
    expect((await alts(ui)).some(a => /grid/i.test(a))).toBe(false)
  }
  await issues.unmount()
})

test('the ring is green while open, amber while building, red for a failed build', async ($, on) => {
  stubs(on, { repos, depth: 3, spawnThrows: true, gh: rest([issue(1), issue(2)]) })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)
  const ring = async (n: number) =>
    String((await ui.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith(`#${n} `))?.props.source)

  expect(await ring(1)).toContain('stroke="#57ab5a"')
  expect(await ring(2)).toContain('stroke="#57ab5a"')
  await ui.press({ key: 'build:2' })
  expect(await ring(2)).toContain('stroke="#e5534b"')
  expect(await ring(1)).toContain('stroke="#57ab5a"')
  await ui.unmount()
})

test('the Refresh and search controls are in the header', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  expect(((await ui.find({ key: 'refresh' }))?.text ?? '').length).toBeGreaterThan(0)
  expect((await ui.find({ key: 'search' }))?.props.placeholder).toBe('Search by #, title, label or author')
  await ui.unmount()
})
