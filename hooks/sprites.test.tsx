import { expect, test } from 'claude-code/testing'

import { colourOfKind, KIND_COLOUR, spriteKindOf, spriteSvg } from './sprites'
import { done, ISSUES, loose, startIn, stubs } from './test-support'

const repos = { 'C:/Code/alpha': 'C:/Code/alpha' }

const COLOURS: [string, string][] = [
  ['lead', '#d4b04a'],
  ['coder', '#e0a15a'],
  ['validator', '#6b8fd6'],
  ['researcher', '#57ab5a'],
  ['explorer', '#4aa3a3'],
  ['Explore', '#4aa3a3'],
  ['general-purpose', '#d4b04a'],
  ['build-lead', '#d4b04a'],
  ['other', '#a6a49d'],
  ['something-else', '#a6a49d'],
]

test('each kind draws its own grid in its own colour', () => {
  for (const [kind, colour] of COLOURS) {
    const source = spriteSvg(20, kind, false)

    expect(source).toContain(`fill="${colour}"`)
    expect(colourOfKind(kind)).toBe(colour)
    expect(source).toContain('viewBox="0 0 12 12"')
    expect(source).toContain('shape-rendering="crispEdges"')
    expect(source).toContain('fill="#ecebe6"')
    expect(source).toContain('fill="#2a2622"')
    // One path for each colour, made of 1x1 squares.
    expect(source.match(/<path /g)).toHaveLength(3)
    expect(source).toContain('h1v1h-1z')
  }
  const grids = ['lead', 'coder', 'validator', 'researcher', 'explorer', 'other'].map(k => spriteSvg(20, k, false).replace(/fill="#[0-9a-f]{6}"/g, ''))

  expect(new Set(grids).size).toBe(6)
  expect(Object.keys(KIND_COLOUR).sort()).toEqual(['coder', 'explorer', 'lead', 'other', 'researcher', 'validator'])
})

test('an unknown type falls back to the plain sprite', () => {
  expect(spriteKindOf('whatever-agent')).toBe('other')
  expect(spriteSvg(16, 'whatever-agent', false)).toBe(spriteSvg(16, 'other', false))
})

test('a running sprite hops, a finished one rests, and reduced motion stops the hop', () => {
  const running = spriteSvg(20, 'coder', true)
  const resting = spriteSvg(20, 'coder', false)

  expect(running).toContain('<g class="hop">')
  expect(resting).not.toContain('class="hop"')
  expect(running).toContain('@keyframes hop{50%{transform:translateY(-1px)}}')
  expect(running).toContain('steps(2)')
  expect(running).toContain('@media (prefers-reduced-motion: reduce){.hop{animation:none}}')
  expect(running).not.toMatch(/crab/i)
})

test('every sprite is 16px, running ones hop and finished ones are faded', async ($, on) => {
  stubs(on, { repos, depth: 3 })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'validator', description: 'Check things', prompt: 'a' }))
  await $.agent.spawn(loose({ subagentType: 'coder', description: '#7 Work', prompt: 'b' }))
  await $.turn.complete(done('agent-1'))
  const ui = await $.ui.mount(ISSUES)
  const sprites = (await ui.findAll({ type: 'Svg' })).filter(s => String(s.props.alt).endsWith(' sprite'))
  const row = sprites.find(s => s.props.alt === 'validator sprite')
  const crew = sprites.find(s => s.props.alt === 'coder sprite')

  expect(row?.props.width).toBe(16)
  expect(String(row?.props.source)).not.toContain('class="hop"')
  expect(String(row?.props.source)).toContain('opacity="0.6"')
  expect(crew?.props.width).toBe(16)
  expect(String(crew?.props.source)).toContain('class="hop"')
  await ui.unmount()

  const narrow = await $.ui.mount({ ...ISSUES, props: { ...ISSUES.props, bodyColumns: 30 } })

  expect((await narrow.findAll({ type: 'Svg' })).filter(s => String(s.props.alt).endsWith(' sprite')).every(s => s.props.width === 16)).toBe(true)
  await narrow.unmount()
})

test('an agent bar wears its kind colour while it runs', async ($, on) => {
  stubs(on, { repos })
  await startIn($, 'C:/Code/alpha')
  await $.agent.spawn(loose({ subagentType: 'validator', description: 'Check things', prompt: 'a' }))
  await $.agent.spawn(loose({ subagentType: 'researcher', description: 'Read things', prompt: 'b' }))
  const ui = await $.ui.mount(ISSUES)
  const bar = async (title: string) => String((await ui.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith(title))?.props.source)

  expect(await bar('Check things')).toContain('fill="#6b8fd6"')
  expect(await bar('Read things')).toContain('fill="#57ab5a"')
  await ui.unmount()
})
