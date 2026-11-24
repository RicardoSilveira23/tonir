// Per-model prices, context windows and number formatting. Every cost shown is an estimate
// built from this table, never the bill.
import type { TokenUsage } from './common'

// USD per million tokens, from the claude-api skill's model table of 2026-11-03, read on
// 2026-11-24. The skill states input, output and (for most families) cache-read prices;
// where it gives only the ratios (reads about 0.1x input, writes about 1.25x input for
// the 5-minute cache) those are applied. A family is matched by name, so any release or
// alias of it is priced at the family's current rate.
type Price = { input: number; output: number; read: number; write: number }

const FAMILIES = {
  opus: { input: 4, output: 20, read: 0.2, write: 5 },
  sonnet: { input: 2, output: 10, read: 0.1, write: 2.5 },
  haiku: { input: 0.1, output: 0.5, read: 0.01, write: 0.125 },
  fable: { input: 8, output: 40, read: 0.2, write: 10 },
} as const satisfies Record<string, Price>

export type Family = keyof typeof FAMILIES

// Haiku 5.5 prices a prompt above 100K tokens at a higher rate.
const HAIKU_LONG_AT = 100_000
const HAIKU_LONG: Price = { input: 0.5, output: 2.5, read: 0.05, write: 0.625 }

export function familyOf(model: string): Family | null {
  const id = model.toLowerCase()
  if (/fable|mythos/.test(id)) return 'fable'
  if (id.includes('opus')) return 'opus'
  if (id.includes('sonnet')) return 'sonnet'
  if (id.includes('haiku')) return 'haiku'

  return null
}

export const isKnownModel = (model: string): boolean => familyOf(model) !== null

// Dollars for one usage record. `isRequest` is true for a single model call, where the
// prompt size decides the long-context rate; a turn total is billed at the base rate.
// An unknown model costs 0 (see isKnownModel).
export function costOf(model: string, u: TokenUsage, isRequest = false): number {
  const family = familyOf(model)
  if (family === null) return 0

  const prompt = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
  const long = isRequest && family === 'haiku' && /haiku-5/i.test(model) && prompt > HAIKU_LONG_AT
  const p: Price = long ? HAIKU_LONG : FAMILIES[family]

  return (
    (u.input_tokens * p.input +
      u.output_tokens * p.output +
      u.cache_read_input_tokens * p.read +
      u.cache_creation_input_tokens * p.write) /
    1e6
  )
}

// Context window: 1M for every current model; Haiku 4.5 and older are 200K.
export const windowOf = (model: string): number => (/haiku-4|claude-3/i.test(model) ? 200_000 : 1_000_000)

// `claude-opus-5-5` -> `Opus 5.5`; a dated id loses its date; an alias is capitalised.
export function modelName(id: string): string {
  const clean = id.replace(/\[.*\]$/, '').trim()
  const m = /^(?:claude-)?([a-z]+)((?:-\d{1,2}){0,2})(?:-\d{8})?$/i.exec(clean)
  if (m === null) return clean === '' ? clean : clean.charAt(0).toUpperCase() + clean.slice(1)
  const [, word = '', rest = ''] = m
  const name = word.charAt(0).toUpperCase() + word.slice(1)
  const version = rest.split('-').filter(Boolean).join('.')

  return version === '' ? name : `${name} ${version}`
}

// 999, 1.2k, 34k, 1.2M.
export function fmtTokens(n: number): string {
  if (n < 1_000) return `${Math.round(n)}`
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1_000)}k`

  return `${(n / 1_000_000).toFixed(1)}M`
}
