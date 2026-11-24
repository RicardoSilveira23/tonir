import { expect, test } from 'claude-code/testing'

import { ISSUES, alts, issueKeys, loose, settle, startIn, stubs, texts } from './test-support'

const repos = { 'C:/Code/alpha': 'C:/Code/alpha' }
const BAR = { plugin: 'tonir', surface: 'desktop', component: 'AbovePrompt', props: {} } as const
const placeholders = async (ui: Parameters<typeof alts>[0]) => (await alts(ui)).filter(a => a === 'loading').length

test('while the repo is being found the pane shows placeholders and never the no-repository text', async ($, on) => {
  stubs(on, { repos })
  // The session has not started: the first pick has not resolved.
  const ui = await $.ui.mount(ISSUES)
  const all = await texts(ui)

  expect(all).toContain('finding repo…')
  expect(all.some(t => /No git repository/.test(t))).toBe(false)
  // Three skeleton rows.
  expect(await placeholders(ui)).toBe(3)
  await ui.unmount()
})

test('after the pick resolves to none the no-repository text shows', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code')
  const ui = await $.ui.mount(ISSUES)

  expect((await texts(ui)).some(t => /No git repository/.test(t))).toBe(true)
  expect(await texts(ui)).not.toContain('finding repo…')
  expect(await placeholders(ui)).toBe(0)
  await ui.unmount()
})

test('while gh loads, the counts are dashes and placeholders sit under Open', async ($, on) => {
  let open = () => {}
  const gate = new Promise<void>(resolve => {
    open = resolve
  })

  stubs(on, { repos, ghGate: gate })
  const started = startIn($, 'C:/Code/alpha')

  await settle()
  const ui = await $.ui.mount(ISSUES)
  const all = await texts(ui)

  expect(all).toEqual(expect.arrayContaining(['alpha', 'loading issues…', 'In this session · – ▾', 'Open · – ▾']))
  expect(all.some(t => /No git repository|No open issues/.test(t))).toBe(false)
  expect(await placeholders(ui)).toBe(6)
  open()
  await started
  await ui.unmount()
  const again = await $.ui.mount(ISSUES)

  expect(await placeholders(again)).toBe(0)
  expect(await issueKeys(again)).toHaveLength(3)
  await again.unmount()
})

test('a refresh says so and keeps the rows until the new ones land', async ($, on) => {
  const hold: { wait?: Promise<void> } = {}

  stubs(on, { repos, ghHold: hold })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  expect(await issueKeys(ui)).toHaveLength(3)
  let release = () => {}

  hold.wait = new Promise<void>(resolve => {
    release = resolve
  })
  const pressed = ui.press({ key: 'refresh' })

  await settle()
  expect((await texts(ui)).some(t => t.endsWith('refreshing…'))).toBe(true)
  expect(await issueKeys(ui)).toHaveLength(3)
  expect(await placeholders(ui)).toBe(0)
  release()
  await pressed
  expect((await texts(ui)).some(t => t.includes('refreshing…'))).toBe(false)
  expect(await issueKeys(ui)).toHaveLength(3)
  await ui.unmount()
})

test('Agents: a dash for the session before the first list, then no section when there is none', async ($, on) => {
  stubs(on, {})
  const before = await $.ui.mount(ISSUES)

  expect(await texts(before)).toContain('Session · –')
  expect((await texts(before)).some(t => t.startsWith('No agents'))).toBe(false)
  await before.unmount()
  await startIn($, 'C:/Code')
  const after = await $.ui.mount(ISSUES)

  expect((await texts(after)).some(t => t.startsWith('Other agents') || t.startsWith('No agents'))).toBe(false)
  expect(await placeholders(after)).toBe(0)
  await after.unmount()
})

test('the bar reads the folder while checking, the repo while loading and mirrors the session issue once the issues are known', { options: { openBar: 'on' } }, async ($, on) => {
  let open = () => {}
  const gate = new Promise<void>(resolve => {
    open = resolve
  })

  stubs(on, { repos, ghGate: gate })
  const checking = await $.ui.mount(BAR as never)

  expect((await checking.findAll({ type: 'Text' })).map(t => t.text).some(t => String(t).endsWith('…'))).toBe(true)
  expect(await checking.find({ key: 'session' })).toBeUndefined()
  await checking.unmount()

  const started = startIn($, 'C:/Code/alpha')

  await settle()
  await $.prompt.submit(loose({ text: 'see #8' }))
  const loading = await $.ui.mount(BAR as never)

  expect((await loading.findAll({ type: 'Text' })).map(t => t.text)).toContain('alpha')
  expect(await loading.find({ key: 'session' })).toBeUndefined()
  await loading.unmount()
  open()
  await started
  await settle()
  const ready = await $.ui.mount(BAR as never)

  expect((await ready.findAll({ type: 'Text' })).map(t => t.text)).toContain('#8')
  await ready.unmount()
})

test('loading draws skeleton rows of the real row height, with a slot-sized block, a shimmer and no empty-state text', async ($, on) => {
  let open = () => {}
  const gate = new Promise<void>(resolve => {
    open = resolve
  })

  stubs(on, { repos, ghGate: gate })
  const started = startIn($, 'C:/Code/alpha')

  await settle()
  const ui = await $.ui.mount(ISSUES)
  const rows = (await ui.findAll({ type: 'Svg' })).filter(s => s.props.alt === 'loading')

  // 5 under Open, 1 under In this session, none under Building.
  expect(rows).toHaveLength(6)
  expect(rows.every(r => r.props.height === 32)).toBe(true)
  for (const row of rows) {
    const source = String(row.props.source)

    // The status text's block: 12 cells wide, one line of text high.
    expect(source).toContain('width="104" height="8" rx="4"')
    expect(source).toContain('class="sh"')
    expect(source).toContain('prefers-reduced-motion: reduce')
    expect(source).toContain('animation:none')
    expect(source).toContain('r="6"')
  }
  const all = await texts(ui)

  expect(all).toEqual(expect.arrayContaining(['In this session · – ▾', 'Open · – ▾']))
  expect(all.some(t => /Nothing building|No issue of this session|No open issues/.test(t))).toBe(false)
  // The header: body-size text with a pulsing dot before it.
  const note = await ui.find({ type: 'Text', text: 'loading issues…' })

  expect(note?.props.size).toBeUndefined()
  const dot = (await ui.findAll({ type: 'Svg' })).find(s => s.props.alt === 'loading dot')

  expect(String(dot?.props.source)).toContain('class="live"')
  expect(String(dot?.props.source)).toContain('prefers-reduced-motion: reduce')
  open()
  await started
  await ui.unmount()
})
