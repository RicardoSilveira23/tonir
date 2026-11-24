import { expect, test } from 'claude-code/testing'

import { pipelineSvg } from './look'
import { ISSUES, loose, startIn, stubs } from './test-support'

const MENU = { plugin: 'tonir', surface: 'desktop', component: 'ContextMenu', props: {} } as const
const BAR = { plugin: 'tonir', surface: 'desktop', component: 'AbovePrompt', props: {} } as const

test('the right-click menu has one row and it opens Tonir', async ($, on) => {
  const { opened } = stubs(on)
  await startIn($, 'C:/Code')
  opened.length = 0
  const ui = await $.ui.mount(MENU as never)

  expect((await ui.findAll({ type: 'Button' })).map(b => b.text)).toEqual(['Open Tonir'])
  await ui.press({ key: 'open-tonir' })
  expect(opened).toEqual(['tonir'])
  await ui.unmount()
})

test('the bar is off by default and draws nothing of ours', async ($, on) => {
  stubs(on)
  await startIn($, 'C:/Code')
  const ui = await $.ui.mount(BAR as never)

  expect(await ui.find({ key: 'bar-issues' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Tonir' })).toBeUndefined()
  await ui.unmount()
})

test('with openBar on and nothing building, the bar says the repo, with Issues and Agents buttons and no pill', { options: { openBar: 'on' } }, async ($, on) => {
  const { opened } = stubs(on, { repos: { 'C:/Code/alpha': 'C:/Code/alpha' } })
  await startIn($, 'C:/Code/alpha')
  opened.length = 0
  const ui = await $.ui.mount(BAR as never)

  expect((await ui.find({ type: 'Text', text: 'alpha' }))?.text).toBe('alpha')
  expect(await ui.find({ key: 'session' })).toBeUndefined()
  expect((await ui.find({ key: 'bar-open' }))?.props.label).toBe('Open Tonir')
  expect(await ui.find({ key: 'bar-issues' })).toBeUndefined()
  expect(await ui.find({ key: 'bar-agents' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text).join(' ')).not.toMatch(/\$|cache|running/)
  await ui.press({ key: 'bar-open' })
  expect(opened).toEqual(['tonir'])
  await ui.unmount()
})

test('while something builds the bar shows the sprite, the number, the title, the pipeline and the stage', { options: { openBar: 'on' } }, async ($, on) => {
  stubs(on, { repos: { 'C:/Code/alpha': 'C:/Code/alpha' }, depth: 3 })
  await startIn($, 'C:/Code/alpha')
  const issues = await $.ui.mount(ISSUES)

  await issues.press({ key: 'build:7' })
  await issues.unmount()
  await $.agent.spawn(loose({ subagentType: 'coder', description: '#7 Work', prompt: 'a' }))
  await $.tool.call({ tool: 'mcp__tonir__step', agentId: 'agent-2', done: 3, total: 5 })
  const ui = await $.ui.mount(BAR as never)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)

  expect(texts).toContain('#7')
  expect(texts).toContain('Add the thing')
  expect(texts).toContain('Build 3/5')
  const drawn = (await ui.findAll({ type: 'Svg' })).map(s => ({ alt: String(s.props.alt), source: String(s.props.source) }))

  expect(drawn.map(b => b.alt)).toEqual(['coder sprite', 'Pipeline: Build 3/5, step 2 of 4'])
  // The pane's own helper and colours: done green, now amber, the rest the track.
  expect(drawn[1]?.source).toBe(pipelineSvg(96, 1))
  expect(drawn[1]?.source).toContain('#57ab5a')
  expect(drawn[1]?.source).toContain('#e0a15a')
  expect(drawn[1]?.source).toContain('#3a3a37')
  expect(texts).not.toContain('alpha')
  await ui.unmount()
})

test('with nothing running the bar mirrors the first issue of this session, and keeps one button', { options: { openBar: 'on' } }, async ($, on) => {
  const { opened } = stubs(on, { repos: { 'C:/Code/alpha': 'C:/Code/alpha' } })
  await startIn($, 'C:/Code/alpha')
  const none = await $.ui.mount(BAR as never)

  expect(await none.find({ key: 'session' })).toBeUndefined()
  expect((await none.findAll({ type: 'Text' })).map(t => t.text)).toContain('alpha')
  await none.unmount()
  await $.prompt.submit(loose({ text: 'look at #8 and #9' }))
  opened.length = 0
  const ui = await $.ui.mount(BAR as never)
  const words = (await ui.findAll({ type: 'Text' })).map(t => String(t.text))

  expect(await ui.find({ key: 'session' })).toBeDefined()
  expect(words.some(t => t === '#8' || t === '#9')).toBe(true)
  expect(words).not.toContain('alpha')
  expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['bar-open'])
  await ui.press({ key: 'bar-open' })
  expect(opened).toEqual(['tonir'])
  await ui.unmount()
})

test('on a narrow bar the title goes first, then the bars', { options: { openBar: 'on' } }, async ($, on) => {
  stubs(on, { repos: { 'C:/Code/alpha': 'C:/Code/alpha' }, depth: 3 })
  await startIn($, 'C:/Code/alpha')
  const issues = await $.ui.mount(ISSUES)

  await issues.press({ key: 'build:7' })
  await issues.unmount()
  const narrow = (columns: number) => ({ ...BAR, props: { bodyColumns: columns } })
  const mid = await $.ui.mount(narrow(70) as never)

  expect((await mid.findAll({ type: 'Text' })).map(t => t.text)).not.toContain('Add the thing')
  expect((await mid.findAll({ type: 'Svg' })).length).toBe(2)
  await mid.unmount()
  const tight = await $.ui.mount(narrow(40) as never)

  expect((await tight.findAll({ type: 'Svg' })).length).toBe(0)
  expect((await tight.findAll({ type: 'Text' })).map(t => t.text)).toContain('#7')
  await tight.unmount()
})
