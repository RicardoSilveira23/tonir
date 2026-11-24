import { expect, test } from 'claude-code/testing'

import { ISSUES, loose, PROJECTS, startIn, stubs } from './test-support'

test('the mod makes no theme call and has no Projects pane', async ($, on) => {
  const { themeCalls } = stubs(on, { repos: { 'C:/Code/alpha': 'C:/Code/alpha' } })
  await startIn($, 'C:/Code/alpha')
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  await $.command.run(loose({ command: 'tonir', args: '' }))

  expect(themeCalls).toEqual([])

  const projects = await $.ui.mount(PROJECTS)
  expect(await projects.findAll({ type: 'Button' })).toEqual([])
  await projects.unmount()

  const issues = await $.ui.mount(ISSUES)
  expect(await issues.find({ type: 'Button', key: 'refresh' })).toBeDefined()
  await issues.unmount()
})

test('/tonir-default-look clears the theme, and only on that command', async ($, on) => {
  const { themeCalls } = stubs(on, { repos: { 'C:/Code/alpha': 'C:/Code/alpha' } })
  await startIn($, 'C:/Code/alpha')
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  expect(themeCalls).toEqual([])

  const out = await $.command.run(loose({ command: 'tonir-default-look', args: '' }))

  expect(themeCalls).toEqual(['clear'])
  expect(JSON.stringify(out)).toContain('Default look')
})
