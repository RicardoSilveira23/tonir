import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { AMBER, GREEN, PANE_BG, TONE } from './look'
import { done, ISSUES, loose, startIn, stubs, texts } from './test-support'

const repos = { 'C:/Code/alpha': 'C:/Code/alpha' }
const BAR = { plugin: 'tonir', surface: 'desktop', component: 'AbovePrompt', props: {} } as const

type Boxes = { findAll: (query: never) => Promise<readonly { key?: unknown; props: Record<string, unknown> }[]> }

const boxes = async (ui: Boxes) => await ui.findAll({ type: 'Box' } as never)

const seed = async ($: Engine, on: On) => {
  stubs(on, { repos, depth: 3, branches: { 'C:/Code/alpha': ['issue-8-fix-the-other-thing'] } })
  await startIn($, 'C:/Code/alpha')
  const ui = await $.ui.mount(ISSUES)

  await ui.press({ key: 'build:7' })
  await $.agent.spawn(loose({ subagentType: 'coder', model: 'claude-sonnet-5-5', description: '#7 Work', prompt: 'a' }))
  await $.tool.call({ tool: 'mcp__tonir__step', agentId: 'agent-2', done: 3, total: 5, note: 'updating tests' })
  await $.agent.spawn(loose({ subagentType: 'validator', model: 'claude-opus-5-5', description: 'Review the mod', prompt: 'b' }))
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Look around', prompt: 'c' }))
  await $.turn.complete(done('agent-3'))
  await $.turn.complete({ ...done('agent-4'), reason: 'error' } as never)

  return ui
}

test('issue and agent rows draw no border and no fill of their own', async ($, on) => {
  const ui = await seed($, on)
  const all = await boxes(ui)

  // The pane's own ground is the one fill: nothing inside it is a card, a tile or a tinted slot.
  const painted = all.filter(b => b.props.borderStyle !== undefined || b.props.borderColor !== undefined || b.props.backgroundColor !== undefined)

  expect(painted).toHaveLength(1)
  expect(painted[0]?.props.backgroundColor).toBe(PANE_BG)
  expect(painted[0]?.props.borderStyle).toBeUndefined()
  expect(all.filter(b => String(b.key).startsWith('issue:') || String(b.key).startsWith('agent:')).length).toBeGreaterThan(3)
  await ui.unmount()
})

test('a section header is the name, the count, then the arrow after it', async ($, on) => {
  const ui = await seed($, on)
  const heads = (await texts(ui)).filter(t => /[▾▸]$/.test(t))

  expect(heads.length).toBeGreaterThanOrEqual(3)
  for (const head of heads) expect(head).toMatch(/^[A-Za-z ]+ · [0-9–]+ [▾▸]$/)
  await ui.unmount()
})

test('Build, the status words and a building issue stage share one right-hand width', async ($, on) => {
  const ui = await seed($, on)
  const right = (await boxes(ui)).filter(b => b.key === 'slot' || b.key === 'stage')
  const words = await texts(ui)

  expect(right.length).toBeGreaterThanOrEqual(3)
  expect(new Set(right.map(b => b.props.width)).size).toBe(1)
  expect(right.every(b => b.props.flexShrink === 0)).toBe(true)
  expect(words).toEqual(expect.arrayContaining(['Branch ready', 'Build 3/5']))
  expect((await ui.find({ key: 'build:9' }))?.props.plain).toBe(true)
  await ui.unmount()
})

test('a building issue is one row, the pipeline and the crew lines, with no container border', async ($, on) => {
  const ui = await seed($, on)
  const all = await boxes(ui)
  const card = all.find(b => b.key === 'issue:7')

  expect(card).toBeDefined()
  expect(card?.props.borderStyle).toBeUndefined()
  expect(card?.props.padding).toBeUndefined()
  expect(all.some(b => b.key === 'detail')).toBe(true)
  const svgs = await ui.findAll({ type: 'Svg' })
  const pipeline = svgs.find(s => String(s.props.alt).startsWith('Pipeline:'))
  const source = String(pipeline?.props.source)

  // One thin line of four rounded 3px segments: done green, now amber, the rest the track.
  expect(source.match(/<rect /g)).toHaveLength(4)
  expect(source.match(/height="3"/g)).toHaveLength(4)
  expect(source).toContain(`fill="${GREEN}"`)
  expect(source).toContain(`fill="${AMBER}"`)
  expect(svgs.some(s => s.props.alt === 'coder sprite')).toBe(true)
  const lines = await texts(ui)

  expect(lines.some(t => /^lead · /.test(t) && t.includes('waiting on coder'))).toBe(true)
  expect(lines.some(t => /^coder · Sonnet 5\.5 · 3\/5 updating tests · ≈\$[0-9.]+ · [0-9]+:[0-9][0-9]$/.test(t))).toBe(true)
  await ui.unmount()
})

test('an agent row keeps its detail line and a thin bar; finished ones are greyed and muted', async ($, on) => {
  const ui = await seed($, on)
  const all = await texts(ui)
  const detail = (kind: string) => all.find(t => t.startsWith(`${kind} · `) && t.includes('ctx '))

  expect(detail('validator')).toMatch(/^validator · Opus 5\.5 · ctx [0-9]+% · [0-9a-zA-Z.]+ · ≈\$[0-9.]+ · done · [0-9]+:[0-9][0-9]$/)
  expect(detail('explore')).toMatch(/ · done · /)
  const svgs = await ui.findAll({ type: 'Svg' })
  const bar = (title: string) => String(svgs.find(s => String(s.props.alt).startsWith(title))?.props.source)

  expect(bar('Review the mod')).toContain('height="3"')
  expect(bar('Review the mod')).toContain('#3f6e44')
  // No badge or slot on an agent row.
  expect((await boxes(ui)).filter(b => String(b.key).startsWith('agent:') && b.props.backgroundColor !== undefined)).toHaveLength(0)
  expect(all).toEqual(expect.arrayContaining(['done']))
  await ui.unmount()
})

test('words take their colour from the theme', async ($, on) => {
  const ui = await seed($, on)
  const colourOf = async (text: string) => (await ui.findAll({ type: 'Text' })).find(t => (t as { text?: unknown }).text === text)?.props.color

  expect(await colourOf('Branch ready')).toBe(TONE.info)
  expect(await colourOf('Build 3/5')).toBe(TONE.busy)
  expect(await colourOf('done')).toBe(TONE.good)
  await ui.unmount()
})

test('the bar draws the pane\'s pipeline and the same stage word', { options: { openBar: 'on' } }, async ($, on) => {
  const ui = await seed($, on)
  const pane = String((await ui.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('Pipeline:'))?.props.source)
  const alt = (await ui.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('Pipeline:'))?.props.alt

  await ui.unmount()
  const bar = await $.ui.mount(BAR as never)
  const svgs = await bar.findAll({ type: 'Svg' })
  const drawn = svgs.find(s => String(s.props.alt).startsWith('Pipeline:'))
  const stripWidth = (source: string) => source.replace(/width="[0-9]+" height="4" viewBox="0 0 [0-9]+ 4"/, '').replace(/ x="[0-9]+"| width="[0-9]+"/g, '')

  expect(drawn?.props.alt).toBe(alt)
  expect(stripWidth(String(drawn?.props.source))).toBe(stripWidth(pane))
  expect((await texts(bar as never)).filter(t => t === 'Build 3/5')).toHaveLength(1)
  expect(svgs.some(s => s.props.alt === 'coder sprite')).toBe(true)
  await bar.unmount()
})
