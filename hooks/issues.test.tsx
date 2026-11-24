import { expect, test } from 'claude-code/testing'

import { ISSUES, issueKeys, loose, settle, startIn, stubs, texts } from './test-support'

const repos = { 'C:/Code/alpha': 'C:/Code/alpha', 'C:/Code/alpha/src': 'C:/Code/alpha', 'C:/Code/beta': 'C:/Code/beta', 'C:/Code/beta/lib': 'C:/Code/beta' }

test('the repo is the session folder, named as such', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha/src')
  const ui = await $.ui.mount(ISSUES)

  expect(await texts(ui)).toContain('alpha')
  expect((await texts(ui)).some(t => t.startsWith('session folder'))).toBe(true)
  expect(await ui.find({ key: 'build:7' })).toBeDefined()
  await ui.unmount()
})

test('with no repo in the session folder, the repo of the last file touched is used', async ($, on) => {
  const { ghCalls } = stubs(on, { repos })
  await startIn($, 'C:/Code')
  const ui = await $.ui.mount(ISSUES)

  expect((await texts(ui)).some(a => /No git repository/.test(a))).toBe(true)

  await $.tool.call({ tool: 'Edit', file_path: 'C:/Code/beta/lib/a.ts', old_string: 'a', new_string: 'b' })
  await settle()
  await ui.unmount()

  const again = await $.ui.mount(ISSUES)
  expect(await texts(again)).toContain('beta')
  expect((await texts(again)).some(t => t.startsWith('files in use'))).toBe(true)
  expect(ghCalls).toEqual(['C:/Code/beta'])
  await again.unmount()
})

test('a file outside any repo does not replace the repo of the last file in one', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code')
  await $.tool.call({ tool: 'Read', file_path: 'C:/Code/beta/lib/a.ts' })
  await settle()
  // A scratch file, a screenshot: no repo there.
  await $.tool.call({ tool: 'Read', file_path: 'C:/Temp/scratch/shot.png' })
  await settle()
  const ui = await $.ui.mount(ISSUES)

  expect(await texts(ui)).toContain('beta')
  expect((await texts(ui)).some(t => t.startsWith('files in use'))).toBe(true)
  await ui.unmount()
})

test('the pane follows the session into another folder', async ($, on) => {
  stubs(on, { repos })
  let folder = 'C:/Work/notes'

  on('session.cwd', () => ({ value: folder }))
  await startIn($, folder)
  const ui = await $.ui.mount(ISSUES)

  expect((await texts(ui)).some(t => t === 'No git repository in C:/Work/notes.')).toBe(true)

  // The session moves (a cd) into a repo: the next look finds it.
  folder = 'C:/Code/alpha'
  await ui.press({ key: 'refresh' })
  await settle()

  expect(await texts(ui)).toContain('alpha')
  expect((await texts(ui)).some(t => t.startsWith('session folder'))).toBe(true)
  await ui.unmount()
})

test('a session folder that is a repo is not replaced by files in another repo', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  await $.tool.call({ tool: 'Read', file_path: 'C:/Code/beta/lib/a.ts' })
  await settle()
  const ui = await $.ui.mount(ISSUES)

  expect((await texts(ui)).some(t => t.startsWith('session folder'))).toBe(true)
  expect(await texts(ui)).not.toContain('beta')
  await ui.unmount()
})

test('paths in a blocked folder are skipped before any file or process call', { options: { blockedFolders: 'Vault' } }, async ($, on) => {
  const { touched, ghCalls } = stubs(on, { repos: { ...repos, 'C:/Code/Vault/app': 'C:/Code/Vault/app' } })
  await startIn($, 'C:/Code/Vault/app')
  await $.tool.call({ tool: 'Write', file_path: 'C:\\Code\\Vault\\app\\x.ts', content: 'x' })
  await $.tool.call(loose<never>({ tool: 'Bash', command: 'ls', cwd: 'C:/Code/Vault/app' }))
  await settle()
  const ui = await $.ui.mount(ISSUES)

  expect((await texts(ui)).some(a => /No git repository/.test(a))).toBe(true)
  expect(touched.some(t => t.toLowerCase().includes('vault'))).toBe(false)
  expect(ghCalls).toEqual([])
  await ui.unmount()
})

test('a #n in a prompt ranks that issue first and marks it', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  expect(await issueKeys(ui)).toEqual(['issue:7', 'issue:8', 'issue:9'])
  expect((await texts(ui)).some(t => t.startsWith('In this session'))).toBe(false)

  await $.prompt.submit(loose({ text: 'please look at #9 again' }))
  expect(await issueKeys(ui)).toEqual(['issue:9', 'issue:7', 'issue:8'])
  expect(await texts(ui)).toContain('In this session · 1 ▾')
  await ui.unmount()
})

test('a branch named issue-<n>-... marks that issue', async ($, on) => {
  stubs(on, { repos, branch: 'issue-8-fix-the-other-thing' })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  expect(await issueKeys(ui)).toEqual(['issue:8', 'issue:7', 'issue:9'])
  await ui.unmount()
})

test('a repo with no GitHub remote shows one muted line in the Open section and no Build button', async ($, on) => {
  stubs(on, { repos, origins: { 'C:/Code/alpha': '' } })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  expect((await texts(ui)).filter(a => /no GitHub remote yet/.test(a))).toHaveLength(1)
  expect(await ui.find({ key: 'build:7' })).toBeUndefined()
  await ui.unmount()
})
