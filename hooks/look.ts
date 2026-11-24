// The look both panes share: the colours, the scale and the few small drawings (the ring and the
// bars). Everything else is the app's own Box, Text, Button, Input and Select.

export const PANE_CSS = `<style>
.k{fill:#d9d8d4}
@media (prefers-color-scheme: dark){.k{fill:#3a3a37}}
.live{animation:tonir-pulse 1.8s ease-in-out infinite}
@keyframes tonir-pulse{0%,100%{opacity:1}50%{opacity:.25}}
@media (prefers-reduced-motion: reduce){.live{animation:none}}
</style>`

// One drawing: the shared styles, then the body.
export const svgDoc = (W: number, H: number, body: string, css = ''): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${PANE_CSS}${css}${body}</svg>`

// --- colours
export const CLAY = '#D97757'
export const INK = '#1F1E1D'
export const GREEN = '#57ab5a'
export const FAIL = '#e5534b'
export const AMBER = '#e0a15a'
export const BLUE = '#6b8fd6'
export const LEAD_HAT = '#b7b4ab'
export const GREY = '#8f8d86'
export const GREEN_MUTED = '#3f6e44'
// The pane's ground, as the approved design draws it. Dark only: the app names no ground colour a mod can use, tells a
// mod nothing of its mode, and drops a CSS light-dark() value (tried in 0.6.4's build).
export const PANE_BG = '#1f1f1e'

// The colours of words, as the app's own theme names them, so light mode and the person's theme follow. The
// hex colours above are for the drawings (SVG), which cannot take a theme key.
export const TONE = { good: 'success', bad: 'error', busy: 'warning', info: 'suggestion' } as const

// A row of the list, as the app's sidebar draws one: plain, 32px high.
export const ROW_H = 32

// A desktop draws a plain Button's label this far in (6px, in cells): rows step in as far, so they stay level with
// the section headers, which are Buttons.
export const BUTTON_INSET = 0.75

// A section's name and count; the arrow after it is drawn (chevronSvg), as the app draws its own.
export const sectionTitle = (name: string, count: string | number | undefined): string => `${name}${count === undefined ? '' : ` · ${count}`}`

// The thin arrow after a section's name: down while open, right while folded.
export const chevronSvg = (isFolded: boolean): string =>
  svgDoc(
    12,
    12,
    `<path d="${isFolded ? 'M1.75 3.5 4.25 6 1.75 8.5' : 'M0.75 4.75 3.25 7.25 5.75 4.75'}" fill="none" stroke="${GREY}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  )

// --- The one scale both panes draw on.
// Spacing on a 4px grid.
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const
// Type sizes.
export const FS = { label: 12, meta: 13, title: 15, big: 20 } as const
export const PAD = SP.lg
// The desktop lays out in character cells of 8px; a Box measured in cells is a multiple of this.
export const CELL = 8
// Radii: a tile, a chip, the end of a bar.
export const RX = { tile: 8, chip: 4, bar: 2 } as const

// The width of the drawings: the pane's, less its padding on both sides.
export const paneWidth = (bodyColumns: number): number => Math.max(248, Math.min(868, bodyColumns * CELL - CELL - 2 * PAD))

// A thin bar, 3px: the track, then the fill; no colour draws the fill grey.
export const BAR_H = 3
export const bar = (x: number, y: number, w: number, fillW: number, color: string | null): string =>
  `<rect class="k" x="${x}" y="${y}" width="${w}" height="${BAR_H}" rx="${RX.bar}"/><rect x="${x}" y="${y}" width="${fillW}" height="${BAR_H}" rx="${RX.bar}" fill="${color ?? GREY}"/>`

// A thin bar of width `w`, filled to `ratio` (0 to 1); drawn in a 4px strip.
export const barSvg = (w: number, ratio: number, color: string | null): string =>
  svgDoc(w, 4, bar(0, 0, w, Math.round(w * Math.max(0, Math.min(1, ratio))), color))

// The pipeline of a build: four steps, as one thin line of four rounded segments. The ones before `now` are done
// (green), `now` is under way (amber), the rest are the track. The pane and the bar both draw it with this.
export const STAGES = ['Ticket', 'Build', 'Check', 'Review'] as const
export const SEGMENT_GAP = 4
export const stageColour = (i: number, now: number): string | null => (i < now ? GREEN : i === now ? AMBER : null)

export const pipelineSvg = (w: number, now: number): string => {
  const segW = (w - SEGMENT_GAP * (STAGES.length - 1)) / STAGES.length
  const body = STAGES.map((_, i) => {
    const color = stageColour(i, now)
    const x = Math.round(i * (segW + SEGMENT_GAP))

    return `<rect ${color === null ? 'class="k" ' : ''}x="${x}" y="0" width="${Math.round(segW)}" height="${BAR_H}" rx="${RX.bar}"${color === null ? '' : ` fill="${color}"`}/>`
  }).join('')

  return svgDoc(w, 4, body)
}

// What the pipeline says to a screen reader: where the build is, and the word shown beside it.
export const pipelineAlt = (now: number, label?: string): string =>
  now >= STAGES.length ? 'Pipeline: done' : `Pipeline: ${label ?? STAGES[now]}, step ${now + 1} of ${STAGES.length}`

// The one glyph of an issue: a ring with a dot.
export const ringSvg = (color: string): string =>
  svgDoc(16, 16, `<circle cx="8" cy="8" r="6.25" fill="none" stroke="${color}" stroke-width="1.5"/><circle cx="8" cy="8" r="1.75" fill="${color}"/>`)

// `coder`, or `some-plugin:coder`; the build lead is `lead`.
export const kindOfType = (type: string, coder = 'coder', validator = 'validator'): string => {
  const t = type.replace(/^[^:]*:/, '').toLowerCase()

  if (t === 'build-lead') return 'lead'
  if (t === 'coder' || t === coder.toLowerCase()) return 'coder'
  if (t === 'validator' || t === validator.toLowerCase()) return 'validator'

  return t
}

// How the pane is shaped by where it is docked: narrow (under about 36 columns), wide and short (docked above or
// below the chat), or tall (beside it, the single column).
export type Shape = 'narrow' | 'wide' | 'tall'

export const shapeOf = (columns: number, rows: number): Shape =>
  columns < 36 ? 'narrow' : columns >= 80 && rows <= 24 ? 'wide' : 'tall'

// --- The skeleton of a row that is still loading: the blocks a real row is made of, a step lighter than the pane,
// with a light band sweeping across them. Reduced motion keeps the blocks and stops the band.
const SKELETON_CSS = `<style>
.sk{fill:#e6e5e1}
@media (prefers-color-scheme: dark){.sk{fill:#2a2a28}}
.sh{animation:sweep 1.4s linear infinite}
@keyframes sweep{from{transform:translateX(-120px)}to{transform:translateX(var(--w))}}
@media (prefers-reduced-motion: reduce){.sh{animation:none;display:none}}
</style>`

// Widths of the title block, as shares of the room, so the rows do not all end at one edge.
const TITLE_SHARES = [0.8, 0.62, 0.7, 0.55, 0.75] as const

// One plain row of 32px: a ring outline, the number block, the title block and a block the width of the status text.
export const skeletonRowSvg = (w: number, index: number, slotW: number): string => {
  const numX = 22
  const numW = 28
  const titleX = numX + numW + 8
  const room = Math.max(40, w - slotW - 8 - titleX)
  const titleW = Math.round(room * (TITLE_SHARES[index % TITLE_SHARES.length] ?? 0.7))
  const shapes = `<rect x="${numX}" y="12" width="${numW}" height="8" rx="${RX.chip}"/><rect x="${titleX}" y="12" width="${titleW}" height="8" rx="${RX.chip}"/><rect x="${w - slotW}" y="12" width="${slotW}" height="8" rx="${RX.chip}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${ROW_H}" viewBox="0 0 ${w} ${ROW_H}" style="--w:${w}px">${SKELETON_CSS}<defs><clipPath id="sk-clip">${shapes}</clipPath><linearGradient id="sk-band"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><circle class="sk-ring" cx="7" cy="16" r="6" fill="none" stroke-width="1.5" style="stroke:#3a3a37"/><g class="sk">${shapes}</g><g clip-path="url(#sk-clip)"><rect class="sh" x="0" y="0" width="120" height="${ROW_H}" fill="url(#sk-band)"/></g></svg>`
}

// A small dot that pulses, for "loading".
export const pulseDotSvg = (): string => svgDoc(8, 8, `<circle class="live" cx="4" cy="4" r="3" fill="#e0a15a"/>`)
