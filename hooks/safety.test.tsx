import { expect, test } from 'claude-code/testing'

import { isBlocked, isSafePath, pinRepo } from './issues'
import { done, ISSUES, issueKeys, loose, settle, startIn, stubs, texts } from './test-support'

const repos = { 'C:/Code/alpha': 'C:/Code/alpha', 'C:/Code/beta/lib': 'C:/Code/beta' }

const outsider = (association: string) =>
  JSON.stringify([
    {
      number: 7,
      title: 'Do the thing',
      html_url: 'https://github.com/o/r/issues/7',
      updated_at: '2026-11-03T00:00:00Z',
      labels: [],
      user: { login: 'mallory' },
      author_association: association,
    },
  ])

test('only drive-letter paths are safe: no network, device or stream spellings', () => {
  for (const ok of ['C:/Code/a', 'C:\\Code\\a', 'd:/x/y.ts']) expect(isSafePath(ok)).toBe(true)
  for (const bad of ['//host@80/share/a', '\\\\server\\share\\a', '\\\\?\\C:\\Code\\a', '//?/C:/Code/a', 'C:/Code/a.txt:stream', 'C:a', '/usr/lib', 'rel/path', '']) {
    expect(isSafePath(bad)).toBe(false)
  }
})

test('configured names and 8.3 short names are blocked', () => {
  expect(isBlocked('C:/Code/Vault/app', ['vault'])).toBe(true)
  expect(isBlocked('C:/Code/a/VAULT', ['vault'])).toBe(true)
  expect(isBlocked('C:\\Code\\VAULT~1\\app')).toBe(true)
  expect(isBlocked('C:/Code/alpha')).toBe(false)
})

test('touched paths of another spelling never reach git, the file system or gh', async ($, on) => {
  const { touched, ghCalls } = stubs(on, { repos })
  await startIn($, 'C:/Code')

  for (const file_path of ['//host@80/share/a.ts', '\\\\?\\C:\\Code\\beta\\lib\\a.ts', 'C:/Code/beta/lib/a.ts:evil', 'C:/Code/VAULT~1/x.ts']) {
    await $.tool.call(loose<never>({ tool: 'Read', file_path }))
  }
  await settle()

  expect(touched.some(t => /host@80|\?|:evil|VAULT/.test(t))).toBe(false)
  expect(ghCalls).toEqual([])
})

test('a Bash cwd is not a source of the working repo', async ($, on) => {
  const { ghCalls } = stubs(on, { repos })
  await startIn($, 'C:/Code')
  await $.tool.call(loose<never>({ tool: 'Bash', command: 'ls', cwd: 'C:/Code/beta/lib' }))
  await settle()

  expect(ghCalls).toEqual([])
})

test('a folder that resolves into a blocked folder is never handed to git, gh or a listing', { options: { blockedFolders: 'vault' } }, async ($, on) => {
  const { touched, ghCalls } = stubs(on, {
    repos: { ...repos, 'C:/Code/link': 'C:/Code/link', 'C:/Code/shadow': 'C:/Code/shadow' },
    real: { 'C:/Code/link': 'C:/Code/Vault/app', 'C:/Code/shadow': 'C:/Code/Vault/shadow' },
    tree: { 'C:/Code': ['alpha', 'shadow'] },
    gitDirs: ['C:/Code/alpha', 'C:/Code/shadow'],
  })
  await startIn($, 'C:/Code')

  // The session is in no repo: shadow is a listed child that lands in a blocked folder.
  const ui = await $.ui.mount(ISSUES)
  expect((await issueKeys(ui)).some(k => k.includes('alpha'))).toBe(true)
  expect((await issueKeys(ui)).some(k => k.includes('shadow'))).toBe(false)
  await ui.unmount()

  await $.tool.call(loose<never>({ tool: 'Read', file_path: 'C:/Code/link/a.ts' }))
  await settle()
  await pinRepo(loose<Parameters<typeof pinRepo>[0]>($), 'C:/Code/link')
  await settle()

  expect(touched.some(t => t.startsWith('git') && /link|shadow/.test(t))).toBe(false)
  expect(touched.filter(t => t.endsWith('/.git')).some(t => t.includes('shadow'))).toBe(false)
  expect(ghCalls.some(c => /link|shadow/.test(c))).toBe(false)
})

test('an issue by an outside author shows the author and cannot be built', async ($, on) => {
  const { spawns } = stubs(on, { repos, gh: { exitCode: 0, stdout: outsider('NONE'), stderr: '' } })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  expect(await ui.find({ key: 'build:7' })).toBeUndefined()
  expect(await texts(ui)).toContain('outside author')
  expect(spawns).toEqual([])
  await ui.unmount()
})

for (const who of ['OWNER', 'MEMBER', 'COLLABORATOR']) {
  test(`an issue by a ${who} may be built`, async ($, on) => {
    stubs(on, { repos, gh: { exitCode: 0, stdout: outsider(who), stderr: '' } })
    await startIn($, 'C:/Code/alpha')
    const ui = await $.ui.mount(ISSUES)

    expect(await ui.find({ key: 'build:7' })).toBeDefined()
    await ui.unmount()
  })
}

test('a new load stops the older load from starting more gh calls', async ($, on) => {
  const names = Array.from({ length: 12 }, (_, i) => `r${i}`)
  let open = () => {}
  const gate = new Promise<void>(resolve => {
    open = resolve
  })
  const { ghCalls } = stubs(on, {
    tree: { 'C:/Code': names },
    gitDirs: names.map(n => `C:/Code/${n}`),
    ghGate: gate,
  })
  const started = startIn($, 'C:/Code')

  await settle()
  await settle()
  // Six calls of the first load are in flight; a second load starts and is gated too.
  const ui = await $.ui.mount(ISSUES)
  const pressed = ui.press({ key: 'refresh' })

  await settle()
  await settle()
  open()
  await pressed
  await started
  await settle()

  // 6 from the cancelled load, 12 from the current one: not 24.
  expect(ghCalls.length).toBe(18)
  await ui.unmount()
})

test('a spawn that throws leaves the build failed with a note, and a press builds again', async ($, on) => {
  const { spawns } = stubs(on, { depth: 3, repos, spawnThrows: true })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)
  await ui.press({ key: 'build:7' })

  expect((await texts(ui)).some(t => t.includes('could not start'))).toBe(true)
  expect((await ui.find({ key: 'build:7' }))?.text).toBe('Retry')
  expect(spawns).toEqual([])
  await ui.unmount()
})

test('a default branch with odd characters never reaches the validator prompt', async ($, on) => {
  const { spawns } = stubs(on, { depth: 1, repos, defaultBranch: 'origin/main; rm -rf x' })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)
  await ui.press({ key: 'build:7' })
  await $.turn.complete(done('agent-1'))

  expect(spawns[1]?.prompt).toContain('main...issue-7')
  expect(spawns[1]?.prompt).not.toContain('rm -rf')
  await ui.unmount()
})

test('a plain default branch is used', async ($, on) => {
  const { spawns } = stubs(on, { depth: 1, repos, defaultBranch: 'origin/trunk' })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)
  await ui.press({ key: 'build:7' })
  await $.turn.complete(done('agent-1'))

  expect(spawns[1]?.prompt).toContain('trunk...issue-7')
  await ui.unmount()
})

test('a prompt the person did not type names no issue of theirs', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  await $.prompt.submit(loose({ text: 'notice about #9', isMeta: true }))
  expect((await texts(ui)).some(t => t.startsWith('In this session'))).toBe(false)
  await $.prompt.submit(loose({ text: 'look at #9' }))
  expect(await texts(ui)).toContain('In this session · 1 ▾')
  await ui.unmount()
})

test('after All repos is picked in the Select, a touched file does not narrow the view', async ($, on) => {
  stubs(on, {
    repos: { 'C:/Code/beta/lib': 'C:/Code/beta' },
    tree: { 'C:/Code': ['alpha', 'beta'] },
    gitDirs: ['C:/Code/alpha', 'C:/Code/beta'],
  })
  await startIn($, 'C:/Code')
  const first = await $.ui.mount(ISSUES)
  await first.select({ key: 'repo', value: '' })
  await first.unmount()
  await $.tool.call(loose<never>({ tool: 'Edit', file_path: 'C:/Code/beta/lib/a.ts', old_string: 'a', new_string: 'b' }))
  await settle()

  const ui = await $.ui.mount(ISSUES)
  expect((await texts(ui)).some(t => t.startsWith('all repos under C:/Code'))).toBe(true)
  await ui.unmount()
})
