import { expect, test } from 'claude-code/testing'

import { done, ISSUES, startIn, stubs, texts } from './test-support'

const repos = { 'C:/Code/alpha': 'C:/Code/alpha' }
const slotWidths = async (ui: { findAll: (q: never) => Promise<readonly { key?: unknown; props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Box' } as never)).filter(b => b.key === 'slot').map(b => b.props.width)

test('a finished build shows a Done badge and no Build or Build again button', async ($, on) => {
  stubs(on, { repos, depth: 3 })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  await ui.press({ key: 'build:7' })
  await $.turn.complete(done('agent-1'))
  expect(await texts(ui)).toContain('Done')
  expect(await ui.find({ key: 'build:7' })).toBeUndefined()
  // Done is done: no way to build it again from the row.
  expect(await ui.find({ key: 'again:7' })).toBeUndefined()
  await ui.unmount()
})

test('an issue with a local issue-<n> branch shows Branch ready and no Build button', async ($, on) => {
  stubs(on, { repos, branches: { 'C:/Code/alpha': ['issue-8-fix-the-other-thing', 'issue-x', 'main'] } })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  expect(await texts(ui)).toContain('Branch ready')
  expect(await ui.find({ key: 'build:8' })).toBeUndefined()
  expect(await ui.find({ key: 'build:7' })).toBeDefined()
  expect(await ui.find({ key: 'build:9' })).toBeDefined()
  await ui.unmount()
})

test('a failed build shows a Failed badge with Retry beside it in the meta line', async ($, on) => {
  stubs(on, { repos, depth: 3, spawnThrows: true })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  await ui.press({ key: 'build:7' })
  expect(await texts(ui)).toContain('Failed')
  expect((await ui.find({ key: 'build:7' }))?.text).toBe('Retry')
  expect(await ui.find({ key: 'again:7' })).toBeUndefined()
  await ui.unmount()
})

test('a badge fills the same slot as the Build button, so rows never shift', async ($, on) => {
  stubs(on, { repos, branches: { 'C:/Code/alpha': ['issue-8-fix-the-other-thing'] } })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)
  const widths = await slotWidths(ui)

  expect(widths).toHaveLength(3)
  expect(new Set(widths).size).toBe(1)
  await ui.unmount()
})

test('on a narrow pane the badge is a short word', async ($, on) => {
  stubs(on, { repos, branches: { 'C:/Code/alpha': ['issue-8-fix-the-other-thing'] } })
  await startIn($, 'C:/Code/alpha')
  const narrow = { ...ISSUES, props: { ...ISSUES.props, bodyColumns: 30 } }
  const ui = await $.ui.mount(narrow)

  expect(await texts(ui)).toContain('Ready')
  expect(await texts(ui)).not.toContain('Branch ready')
  await ui.unmount()
})
