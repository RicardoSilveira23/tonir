import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register, TurnCompleteInput } from 'claude-code'

import type { AgentRun, MainUsage, Panel } from '../types'
import { fmtCost } from './common'
import { costOf, fmtTokens, modelName, windowOf } from './cost'
import { config } from './config'
import { TONIR_PANE, TONIR_TITLE } from './ids'
import { AMBER, FAIL, GREEN, kindOfType } from './look'

// Change a tag when the fields of its value change: state outlives a reload.
export const agents = atom({ plugin: 'tonir', key: 'agents' } as const, [] as AgentRun[], { shape: 'agents-2' })
const panel = atom({ plugin: 'tonir', key: 'panel' } as const, { isListed: false } as Panel, {
  shape: 'panel-4',
})
const mainUsage = atom(
  { plugin: 'tonir', key: 'mainUsage' } as const,
  { cost: 0, tokens: 0, input: 0, cacheRead: 0, startedAt: 0, contextTokens: 0, contextMax: 0, model: '', isRunning: false } as MainUsage,
  { shape: 'main-usage-3' },
)
const now = atom({ plugin: 'tonir', key: 'now' } as const, 0)

export const PANE = TONIR_PANE
export const STEP_TOOL = 'mcp__tonir__step'
export { modelName }

// Asks an agent to report its steps. Tonir's own build agents carry it, and the subagents they start get it here;
// no other agent of the session is touched.
export const STEP_BRIEF = `

Reporting your progress: your first action is to call \`${STEP_TOOL}\` with \`total\` (how many steps you expect the task to take) and \`done: 0\`. Call it again each time a step is finished, with the new \`done\` count and, if useful, a short \`note\`. Revise \`total\` when the plan changes. It costs almost nothing and is how the person watching sees where you are.`

// Elapsed time as m:ss, or h:mm:ss from one hour.
export const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')

  return h > 0 ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`
}

// Two descriptions are the same task when they match once case and punctuation are ignored.
const sameTask = (a: string, b: string): boolean => {
  const key = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

  return key(a) !== '' && key(a) === key(b)
}

export const elapsed = (a: AgentRun, at: number): number => (a.endedAt ?? Math.max(at, a.startedAt)) - a.startedAt

// --- What the pane lists: every agent the engine knows, with the engine's own word on where it stands.

// running: a turn is under way; background: the turn ended but work it owns still runs; idle and
// done and failed are at rest.
export type Live = 'running' | 'background' | 'idle' | 'done' | 'failed'
export type Row = AgentRun & { live: Live }

export const isActiveLive = (live: Live): boolean => live === 'running' || live === 'background'

// The engine's status says `waiting` while an agent holds on background work; its task status
// stays `completed` for a subagent whose turn ended, so a task that still runs counts too.
export function liveOf(info: Pick<AgentInfo, 'status' | 'taskStatus'>): Live {
  if (info.status === 'waiting') return 'background'
  if (info.status === 'running' || info.status === 'pending') return 'running'
  if (info.taskStatus === 'running' && (info.status === 'completed' || info.status === 'idle')) return 'background'
  if (info.status === 'idle') return 'idle'
  if (info.status === 'completed') return 'done'

  return 'failed'
}

const fromInfo = (info: AgentInfo): AgentRun => ({
  id: info.id,
  agentId: info.id,
  type: info.type,
  description: info.description,
  model: info.model ?? '',
  status: 'running',
  startedAt: info.startTime,
  contextTokens: info.tokenCount,
  contextMax: info.contextWindowSize ?? windowOf(info.model ?? ''),
  tokens: info.tokenCount,
  costUsd: info.cost?.usd ?? 0,
  steps: 0,
  promptTokens: 0,
  cacheRead: 0,
  round: 1,
})

// One row for an agent that ran in several rounds: the runs that share an agent id, or a description, are one. It
// shows the latest round's state, "round N", and the totals of every round.
function mergeRounds<T extends AgentRun>(rows: T[]): T[] {
  const groups: T[][] = []

  for (const row of rows) {
    const found = groups.find(g => g.some(r => (row.agentId !== undefined && r.agentId === row.agentId) || r.id === row.id || sameTask(r.description, row.description)))

    if (found === undefined) groups.push([row])
    else found.push(row)
  }

  return groups.map(g => {
    if (g.length === 1) return g[0] as T

    const latest = g.reduce((a, b) => (b.startedAt >= a.startedAt ? b : a))
    const sum = (pick: (r: T) => number) => g.reduce((n, r) => n + pick(r), 0)

    return {
      ...latest,
      round: Math.max(latest.round, g.length),
      tokens: sum(r => r.tokens),
      costUsd: sum(r => r.costUsd),
      steps: sum(r => r.steps),
      promptTokens: sum(r => r.promptTokens),
      cacheRead: sum(r => r.cacheRead),
    }
  })
}

// Our own records joined to the engine's list. A list that cannot be read leaves our records' own status.
export async function agentRows($: EngineInterface): Promise<Row[]> {
  const runs = await read($, agents)
  let infos: readonly AgentInfo[] | undefined

  try {
    infos = await $.agent.list()
  } catch {
    infos = undefined
  }

  const rows: Row[] = runs.map(run => {
    const info = infos?.find(i => i.id === run.agentId || i.id === run.id)
    const live: Live = info === undefined ? run.status : liveOf(info)

    // Time runs from the agent's own start: the engine's record of it when that is earlier than our note of the spawn.
    return { ...run, live, startedAt: info === undefined ? run.startedAt : Math.min(run.startedAt, info.startTime) }
  })

  const merged = mergeRounds(rows)
  // An earlier round's own id still names a row: the engine's list must not bring it back.
  const known = new Set(rows.flatMap(r => [r.id, r.agentId ?? r.id]))

  rows.length = 0
  rows.push(...merged)

  for (const info of infos ?? []) {
    if (!known.has(info.id) && !rows.some(r => r.agentId === info.id || r.id === info.id)) rows.push({ ...fromInfo(info), live: liveOf(info) })
  }

  return rows
}

// --- Totals: one scope, the session's: the main loop and every agent.

export type Totals = { cost: number; tokens: number; time: number; cache: number }

export async function sessionTotals($: EngineInterface, list: AgentRun[], at: number): Promise<Totals> {
  const main = await read($, mainUsage)
  const cost = main.cost + list.reduce((s, a) => s + a.costUsd, 0)
  const tokens = main.tokens + list.reduce((s, a) => s + a.tokens, 0)
  const input = main.input + list.reduce((s, a) => s + a.promptTokens, 0)
  const cacheRead = main.cacheRead + list.reduce((s, a) => s + a.cacheRead, 0)
  const start = Math.min(...[main.startedAt, ...list.map(a => a.startedAt)].filter(t => t > 0))

  return {
    cost,
    tokens,
    time: Number.isFinite(start) ? Math.max(0, at - start) : 0,
    cache: input === 0 ? 0 : Math.round((cacheRead / input) * 100),
  }
}

export const totalsLine = (t: Totals): string => `≈${fmtCost(t.cost)} · ${fmtTokens(t.tokens)} tokens · ${fmtTime(t.time)} · cache ${t.cache}%`

// The task's own progress when the worker reports steps; a finished run is full.
export const progressOf = (a: Row): number | null => {
  if (a.live === 'done') return 1
  if (a.stepTotal) return Math.min(1, (a.stepDone ?? 0) / a.stepTotal)

  return null
}

export const ctxOf = (a: AgentRun): number => (a.contextMax ? Math.min(100, Math.round((a.contextTokens / a.contextMax) * 100)) : 0)

// "Opus 5.5 · low" for a run, or just the model when no effort was seen.
export const runModel = (a: AgentRun): string => (a.effort ? `${modelName(a.model)} · ${a.effort}` : modelName(a.model))

// The `#n` of the issue an agent works on, from its description.
export const issueOf = (a: Pick<AgentRun, 'description'>): number | null => {
  const m = /#(\d{1,6})\b/.exec(a.description)

  return m === null ? null : Number(m[1])
}

// What stands at the right of a row: where the run is.
export function markOf(a: Row): { text: string; color: string | undefined } {
  if (a.live === 'failed') return { text: 'failed', color: FAIL }
  if (a.live === 'done') return { text: 'done', color: GREEN }
  if (a.live === 'idle') return { text: 'idle', color: undefined }
  if (a.live === 'background') return { text: 'background work running', color: AMBER }
  // Before the first step report there is nothing to count yet.
  if (a.stepTotal && (a.stepDone ?? 0) > 0) return { text: `${a.stepDone ?? 0}/${a.stepTotal}`, color: undefined }
  if (a.steps === 0 && a.tokens === 0) return { text: 'starting…', color: undefined }

  return { text: 'running', color: AMBER }
}

export const agentKind = (a: AgentRun): string => kindOfType(a.type, config().coderAgent, config().validatorAgent)


// Ticks the running agents' clocks, quiet when nothing runs. One engine process can
// host several sessions, so there is one timer per session.
const timers = new Map<string, { cancel: () => void }>()

// What the status line shows: the session's cost and cache share.
async function publishStatus($: EngineInterface): Promise<void> {
  const t = await sessionTotals($, await read($, agents), await $.clock.now())

  $.ui.status(`≈${fmtCost(t.cost)} · cache ${t.cache}%`)
}

// Registers the step tool and the open command, and starts the clock.
export async function initAgentsPanel($: EngineInterface): Promise<void> {
  await $.tool.register({
    name: 'step',
    description:
      'Report how far along the task is. Give total, the number of steps you expect, and done, how many are finished; add a short note naming the step in hand. Call it at the start with done 0 and after each step.',
    inputSchema: {
      type: 'object',
      properties: {
        done: { type: 'integer', minimum: 0, description: 'Steps finished so far.' },
        total: { type: 'integer', minimum: 1, description: 'Steps expected in all; send it again when the plan changes.' },
        note: { type: 'string', description: 'A few words on the step in hand.' },
      },
      required: ['done'],
      additionalProperties: false,
    },
  })
  const at = await $.clock.now()
  await update($, mainUsage, old => (old.startedAt > 0 ? old : { ...old, startedAt: at }))
  // The first answer of the engine's agent list ends the pane's loading state.
  await agentRows($)
  await update($, panel, old => ({ ...old, isListed: true }))

  let key = ''

  try {
    key = await $.session.id()
  } catch {
    // no id: one shared timer, as before
  }
  timers.get(key)?.cancel()
  timers.set(key, $.clock.every(1000, () => {
    void (async () => {
      const list = await read($, agents)

      if (!list.some(a => a.status === 'running')) return

      const tick = await $.clock.now()
      await update($, now, () => tick)
    })()
  }))
}

// True when a surface draws the pane now.
export async function openAgentsPanel($: EngineInterface): Promise<boolean> {
  const at = await $.clock.now()
  await update($, now, () => at)

  return (await $.ui.open({ id: PANE, title: TONIR_TITLE })).isPlaced
}

// The turn.complete work: a subagent's final state, or the main session's usage.
export async function noteTurnComplete($: EngineInterface, e: TurnCompleteInput): Promise<void> {
  const u = e.usage

  if (e.agentId !== undefined) {
    const agentId = e.agentId
    const at = await $.clock.now()

    await update($, agents, list =>
      list.map(a => {
        if (a.agentId !== agentId && a.id !== agentId) return a

        const ended: AgentRun = { ...a, status: e.reason === 'answer' ? 'done' : 'failed', endedAt: at }

        // A run that reported no model request of its own takes the turn's total.
        if (u === undefined || a.steps > 0) return ended

        const prompt = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

        return {
          ...ended,
          tokens: prompt + u.output_tokens,
          costUsd: costOf(u.model, u),
          promptTokens: prompt,
          cacheRead: u.cache_read_input_tokens,
        }
      }),
    )
  } else {
    const prompt = u === undefined ? 0 : u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

    // The main loop's turn ended: it is idle until its next model request.
    await update($, mainUsage, old =>
      u === undefined
        ? { ...old, isRunning: false }
        : {
            ...old,
            cost: old.cost + costOf(u.model, u),
            tokens: old.tokens + prompt + u.output_tokens,
            input: old.input + prompt,
            cacheRead: old.cacheRead + u.cache_read_input_tokens,
            isRunning: false,
          },
    )
  }

  await publishStatus($)
}

export const registerAgentsPanel: Register = on => {
  // A worker reports its own progress. Only a known subagent can: the main session has no row to fill.
  on('tool.call', { tool: STEP_TOOL }, async ($, e) => {
    const agentId = e.agentId
    const known = agentId !== undefined && (await read($, agents)).some(a => a.agentId === agentId || a.id === agentId)

    if (!known) return { result: 'ignored: the step tool is for subagents Tonir started' }

    const done = Math.max(0, Math.floor(Number(e.done) || 0))
    const total = Number(e.total)
    const note = typeof e.note === 'string' ? e.note.trim().slice(0, 80) : undefined

    await update($, agents, list =>
      list.map(a =>
        a.agentId !== agentId && a.id !== agentId
          ? a
          : {
              ...a,
              stepDone: done,
              stepTotal: Number.isFinite(total) && total >= 1 ? Math.floor(total) : a.stepTotal,
              stepNote: note === '' ? a.stepNote : (note ?? a.stepNote),
            },
      ),
    )

    return { result: 'noted' }
  })

  on('agent.spawn', async ($, e, next) => {
    const parent = e.parentAgentId
    const isOwn = e.prompt.includes(STEP_TOOL)
    const isUnderOwn = !isOwn && parent !== undefined && (await read($, agents)).some(a => (a.agentId === parent || a.id === parent) && a.isBriefed === true)
    const started = await next(isUnderOwn ? { ...e, prompt: e.prompt + STEP_BRIEF } : e)

    if (started.deny !== undefined) return started

    // Bookkeeping must never stop a spawn that already started.
    try {
      const at = await $.clock.now()
      const description = e.description ?? ''
      const isQuiet = !(await read($, agents)).some(a => a.status === 'running')
      const id = started.agentId ?? e.tool_use_id

      const run: AgentRun = {
        id,
        agentId: started.agentId,
        type: e.subagentType ?? 'general-purpose',
        description,
        model: started.model,
        status: 'running',
        startedAt: at,
        contextTokens: 0,
        contextMax: windowOf(started.model),
        tokens: 0,
        costUsd: 0,
        steps: 0,
        promptTokens: 0,
        cacheRead: 0,
        round: 1,
        isBriefed: isOwn || isUnderOwn,
      }

      await update($, agents, list => [...list, { ...run, round: 1 + list.filter(a => sameTask(a.description, description)).length }])
      await update($, now, () => at)

      if (isQuiet && config().autoOpenAgents === 'on-spawn') await openAgentsPanel($)
    } catch {
      // the row is missing, the agent runs
    }

    return started
  })

  // Each model request of a subagent: its usage joins the run's, and the latest call is what fills its context. A
  // request of the main loop marks it running and its prompt is what fills the main row's context.
  on('turn.step', async function* ($, e, next) {
    const agentId = e.agentId

    if (agentId === undefined) {
      try {
        await update($, mainUsage, old => (old.isRunning && old.model === e.model ? old : { ...old, isRunning: true, model: e.model }))
      } catch {
        // the main row lags, the request goes on
      }
    }

    for await (const chunk of next(e)) {
      if (agentId === undefined && chunk.kind === 'stop' && chunk.usage !== null) {
        const u = chunk.usage
        const prompt = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

        try {
          await update($, mainUsage, old => ({ ...old, contextTokens: prompt, contextMax: windowOf(e.model), model: e.model }))
        } catch {
          // the main row lags, the request goes on
        }
      }

      if (agentId !== undefined && chunk.kind === 'stop' && chunk.usage !== null) {
        const u = chunk.usage
        const prompt = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

        await update($, agents, list =>
          list.map(a =>
            a.agentId !== agentId && a.id !== agentId
              ? a
              : {
                  ...a,
                  tokens: a.tokens + prompt + u.output_tokens,
                  costUsd: a.costUsd + costOf(e.model, u, true),
                  steps: a.steps + 1,
                  promptTokens: a.promptTokens + prompt,
                  cacheRead: a.cacheRead + u.cache_read_input_tokens,
                  contextTokens: prompt,
                  contextMax: a.contextMax > 0 ? a.contextMax : windowOf(e.model),
                  effort: typeof e.effort === 'string' ? e.effort : a.effort,
                },
          ),
        )
        // The status line follows each request, as the pane does, not only the end of a turn.
        try {
          await publishStatus($)
        } catch {
          // the status line lags, the request goes on
        }
      }

      yield chunk
    }
  })
}

// The main loop as one agent of its own: its model, how full its context is, what it has used and whether it runs.
export type MainView = { model: string; ctx: number; tokens: number; cost: number; time: number; isRunning: boolean }

async function mainView($: EngineInterface, at: number): Promise<MainView> {
  const m = await read($, mainUsage)
  let model = m.model

  if (model === '') {
    try {
      model = await $.session.model()
    } catch {
      // no model to name yet
    }
  }

  return {
    model,
    ctx: m.contextMax > 0 ? Math.min(100, Math.round((m.contextTokens / m.contextMax) * 100)) : 0,
    tokens: m.tokens,
    cost: m.cost,
    time: m.startedAt > 0 ? Math.max(0, at - m.startedAt) : 0,
    isRunning: m.isRunning,
  }
}

// What the pane draws of the agents: every agent the engine knows, the main loop, the session's totals, and whether
// the engine has answered yet.
export async function agentView($: EngineInterface): Promise<{ rows: Row[]; main: MainView; at: number; totals: Totals; isListed: boolean }> {
  const rows = await agentRows($)
  const p: Panel = await read($, panel)
  const at = Math.max(await read($, now), await $.clock.now(), ...rows.map(a => a.startedAt), 0)

  return { rows, main: await mainView($, at), at, totals: await sessionTotals($, rows, at), isListed: p.isListed }
}
