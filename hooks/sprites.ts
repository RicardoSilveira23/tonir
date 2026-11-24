// The pixel sprites of the agents: one 12x12 grid for each kind. In a grid, `a` is the kind's colour, `w` the
// eye white, `d` the pupil and `.` nothing.

export type SpriteKind = 'other' | 'lead' | 'coder' | 'validator' | 'researcher' | 'explorer'

const GRIDS: Record<SpriteKind, readonly string[]> = {
  other: ['............', '............', '............', '............', '...aaaaaa...', '.aawaaaaaaa.', 'aaawdaawdaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', '.aaaaaaaaaa.', '..a......a..', '............'],
  lead: ['............', '............', '............', '..a.aaaa.a..', '..aaaaaaaa..', '.aawaaaaaaa.', 'aaawdaawdaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', '.aaaaaaaaaa.', '..a......a..', '............'],
  coder: ['............', '.....aa.....', '.....aa.....', '......a.....', '...aaaaaa...', '.aawaaaaaaa.', 'aaawdaawdaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', '.aaaaaaaaaa.', '..a......a..', '............'],
  validator: ['............', '............', '.a........a.', '..a......a..', '...aaaaaa...', '.aawaaaaaaa.', 'aaawdaawdaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', '.aaaaaaaaaa.', '..a......a..', '............'],
  researcher: ['............', '............', '...aa..aa...', '....aaaa....', '...aaaaaa...', '.aawaaaaaaa.', 'aaawdaawdaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', '.aaaaaaaaaa.', '..a......a..', '............'],
  explorer: ['............', '............', '.........aa.', '........a...', '...aaaaaa...', '.aawaaaaaaa.', 'aaawdaawdaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', '.aaaaaaaaaa.', '..a......a..', '............'],
}

export const KIND_COLOUR: Record<SpriteKind, string> = {
  lead: '#d4b04a',
  coder: '#e0a15a',
  validator: '#6b8fd6',
  researcher: '#57ab5a',
  explorer: '#4aa3a3',
  other: '#a6a49d',
}

const WHITE = '#ecebe6'
const PUPIL = '#2a2622'

// The sprite an agent kind wears: the lead and general-purpose agents the lead's, any unknown kind the plain one.
export const spriteKindOf = (kind: string): SpriteKind => {
  const k = kind.toLowerCase()

  if (k === 'lead' || k === 'general-purpose' || k === 'build-lead') return 'lead'
  if (k === 'coder' || k === 'validator' || k === 'researcher') return k
  if (k === 'explore' || k === 'explorer') return 'explorer'

  return 'other'
}

export const colourOfKind = (kind: string): string => KIND_COLOUR[spriteKindOf(kind)]

// One path for a colour, made of 1x1 squares.
const pathOf = (rows: readonly string[], mark: string, fill: string): string => {
  let d = ''

  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === mark) d += `M${x} ${y}h1v1h-1z`
    }),
  )

  return d === '' ? '' : `<path d="${d}" fill="${fill}"/>`
}

// A running agent hops one unit and back in two steps; a finished one rests, and so does any when motion is reduced.
const SPRITE_CSS =
  '<style>.hop{animation:hop .9s steps(2) infinite}@keyframes hop{50%{transform:translateY(-1px)}}@media (prefers-reduced-motion: reduce){.hop{animation:none}}</style>'

export const spriteSvg = (size: number, kind: string, isRunning: boolean, isFaded = false): string => {
  const sprite = spriteKindOf(kind)
  const rows = GRIDS[sprite]
  const body = pathOf(rows, 'a', KIND_COLOUR[sprite]) + pathOf(rows, 'w', WHITE) + pathOf(rows, 'd', PUPIL)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 12 12" shape-rendering="crispEdges"${isFaded ? ' opacity="0.6"' : ''}>${SPRITE_CSS}<g${isRunning ? ' class="hop"' : ''}>${body}</g></svg>`
}
