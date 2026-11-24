import { expect, test } from 'claude-code/testing'

import { CELL, FS, paneWidth, PAD, RX, SP } from './look'
import { ISSUES, done, drawn, loose, startIn, stubs } from './test-support'

const repos = { 'C:/Code/alpha': 'C:/Code/alpha' }
const TYPE = Object.values(FS)
const SPACING = Object.values(SP)
const RADII = [...Object.values(RX)]

const numbers = (source: string, attribute: string) => [...source.matchAll(new RegExp(`${attribute}="([\\d.]+)"`, 'g'))].map(m => Number(m[1]))

test('the scale is on the 4px grid', () => {
  expect(SPACING).toEqual([4, 8, 12, 16, 24])
  expect(TYPE).toEqual([12, 13, 15, 20])
  expect(PAD).toBe(16)
  // Padding and gaps are whole cells of the desktop's 8px grid.
  expect(PAD % CELL).toBe(0)
  expect(SP.sm % CELL).toBe(0)
})

test('every radius drawn in either pane is from the scale, and every drawing is a multiple of 4 tall', async ($, on) => {
  stubs(on, { depth: 3, repos })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'coder', model: 'opus', description: 'Build work', prompt: 'a' }))
  await $.tool.call({ tool: 'mcp__tonir__step', agentId: 'agent-1', done: 2, total: 5, note: 'tests' })
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Look', prompt: 'b' }))
  await $.turn.complete(done('agent-2'))
  const issues = await $.ui.mount(ISSUES)

  await $.prompt.submit(loose({ text: 'see #9' }))
  await issues.press({ key: 'build:7' })


  for (const ui of [issues]) {
    const source = await drawn(ui)

    expect(source.length).toBeGreaterThan(0)
    for (const size of numbers(source, 'font-size')) expect(TYPE).toContain(size)
    for (const rx of numbers(source, 'rx')) expect(RADII).toContain(rx)

    for (const svg of await ui.findAll({ type: 'Svg' })) {
      expect(Number(svg.props.height) % 4).toBe(0)
      expect(Number(svg.props.width) % 1).toBe(0)
    }
  }
  await issues.unmount()
})

test('the drawings fit the pane less its padding', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'Explore', description: 'Look', prompt: 'b' }))
  const agents = await $.ui.mount(ISSUES)
  const width = paneWidth(60)

  for (const svg of await agents.findAll({ type: 'Svg' })) expect(Number(svg.props.width)).toBeLessThanOrEqual(width)
  await agents.unmount()
})
