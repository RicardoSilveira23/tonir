import { mock } from 'claude-code/testing'
import type { AgentInfo, AgentLimits, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

// Nothing here touches a real repo, gh or agent: each call is a stub.

const pane = (requestId: string, title: string) =>
  ({
    plugin: 'tonir',
    component: 'Pane',
    requestId,
    surface: 'desktop',
    props: {
      title,
      isFocused: false,
      bodyColumns: 60,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  }) as const

export const ISSUES = pane('tonir', 'Tonir')
export const PROJECTS = pane('tonir-projects', 'Projects')

// The shape of `gh api repos/{owner}/{repo}/issues`.
const row = (number: number, title: string, updatedAt: string) => ({
  number,
  title,
  html_url: `https://github.com/o/r/issues/${number}`,
  updated_at: updatedAt,
  labels: [{ name: 'bug', color: 'd73a4a' }],
  user: { login: 'ana' },
  author_association: 'OWNER',
})

// #7 is the newest, #9 the oldest.
export const ISSUE_JSON = JSON.stringify([
  row(7, 'Add the thing', '2026-11-03T00:00:00Z'),
  row(8, 'Fix the other thing', '2026-11-02T00:00:00Z'),
  row(9, 'Tidy the docs', '2026-11-01T00:00:00Z'),
])

// The engine hands paths back in the host's own spelling.
const norm = (path: string) => path.split(String.fromCharCode(92)).join('/')

type Spawn = { subagentType?: string; model?: string; cwd?: string; prompt: string; description?: string }

type Options = {
  gh?: { exitCode: number; stdout: string; stderr: string }
  depth?: number
  agents?: AgentInfo[]
  // folder -> its git toplevel; any other folder is no repository
  repos?: Record<string, string>
  branch?: string
  // folder -> the names of its sub-folders; folders listed in gitDirs hold a .git
  tree?: Record<string, string[]>
  gitDirs?: string[]
  // gh answers per repo folder, over `gh`
  // folder -> where it really lands (a link, a short name); any other folder lands on itself
  real?: Record<string, string>
  // the mocked clock, in milliseconds
  now?: number
  // gh waits for this before it answers: a load that is slow
  ghGate?: Promise<void>
  // gh waits for this when it is set: a refresh that is slow
  ghHold?: { wait?: Promise<void> }
  // the answer of `git symbolic-ref` (the default branch)
  defaultBranch?: string
  // local branches per repo folder, as for-each-ref lists them
  branches?: Record<string, string[]>
  // a spawn that throws
  spawnThrows?: boolean
  // an agent.register that throws
  registerThrows?: boolean
  // agent types that do not exist: a spawn of one is refused
  unknownTypes?: string[]
  ghBy?: Record<string, { exitCode: number; stdout: string; stderr: string }>
  // the origin remote per repo folder; '' is no origin. Absent: https://github.com/test/<folder name>.git
  origins?: Record<string, string>
  // whether the signed-in account can push (gh api repos/<slug>); true when absent
  canPush?: boolean
  // the signed-in login (gh api user); 'ana' when absent
  viewer?: string
  // the issue as read again at Build, over the listed row: a different author, a closed state
  ticket?: Record<number, object>
}

const result = (exitCode: number, stdout: string, stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

export function stubs(on: On, options: Options = {}) {
  // Every argv a process call got, every path a file call got.
  const touched: string[] = []
  const spawns: Spawn[] = []
  // The issue lists only: the folder each was run in, and its argv.
  const ghCalls: string[] = []
  const ghArgv: string[][] = []
  // Every other gh call (a Build's checks and its read of the issue).
  const ghOther: string[][] = []
  const registered: Record<string, unknown>[] = []
  const opened: string[] = []
  const ended = new Set<string>()
  const themeCalls: string[] = []
  const gh = options.gh ?? { exitCode: 0, stdout: ISSUE_JSON, stderr: '' }
  const repos = options.repos ?? { 'C:/Code/alpha': 'C:/Code/alpha' }

  const clock = mock.clock(on, { now: options.now ?? 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.toast', () => ({ value: undefined }))
  // Every text the status line was given.
  const statuses: string[] = []
  on('ui.status', (_, e) => {
    statuses.push(String(e.text))

    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('agent.register', (_, e) => {
    if (options.registerThrows) throw new Error('isolation is not available here')
    registered.push({ ...e })

    return { value: { agent: `tonir:${e.name}` } }
  })
  on('command.register', () => ({ value: { command: 'tonir' } }))
  on('tool.register', () => ({ value: undefined }) as never)
  // What the engine would list: one running agent per spawn, numbered as the stub ids them.
  on('agent.list', () => ({
    value:
      options.agents ??
      spawns.map(
        (s, i) =>
          ({
            id: `agent-${i + 1}`,
            description: s.description ?? '',
            type: s.subagentType ?? 'general-purpose',
            status: ended.has(`agent-${i + 1}`) ? 'completed' : 'running',
            kind: 'local_agent',
            taskStatus: ended.has(`agent-${i + 1}`) ? 'completed' : 'running',
            label: s.description ?? '',
            startTime: 1_000_000,
            cwd: '/',
            tokenCount: 0,
            tokenSamples: [],
            hasRow: true,
          }) satisfies AgentInfo,
      ),
  }))
  // Engines before 2.1.330 have no agent.limits event, and a hook on it fails to load.
  if (options.depth !== undefined) {
    on('agent.limits', () => ({
      value: { concurrent: 20, depth: options.depth ?? 1, isBackgroundEnabled: true } satisfies AgentLimits,
    }))
  }
  on('fs.list', (_, e) => {
    const path = norm(e.path)
    touched.push(path)
    const names = options.tree?.[path] ?? []

    return {
      value: [
        ...names.map(name => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })),
        ...(names.length > 0 ? [{ name: 'notes.txt', kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false }] : []),
      ],
    }
  })
  on('fs.stat', (_, e) => {
    const path = norm(e.path)
    touched.push(path)

    return { value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false, realPath: options.real?.[path] ?? path } }
  })
  on('fs.exists', (_, e) => {
    const path = norm(e.path)
    touched.push(path)

    return { value: path.endsWith('/.git') && (options.gitDirs ?? []).includes(path.slice(0, -5)) }
  })
  on('fs.read', (_, e) => {
    touched.push(norm(e.path))

    return { value: '' }
  })
  on('process.run', async (_, e) => {
    touched.push(e.argv.join(' '))

    if (e.argv[0] === 'gh') {
      const where = norm(e.init?.cwd ?? '')
      const path = e.argv[2] ?? ''
      const listed = options.ghBy?.[where] ?? gh

      if (!path.endsWith('/issues')) {
        ghOther.push([...e.argv])
        if (path === 'user') return result(0, JSON.stringify({ login: options.viewer ?? 'ana' }))
        if (/^repos\/[^/]+\/[^/]+$/.test(path)) return result(0, JSON.stringify({ permissions: { push: options.canPush ?? true } }))
        const one = /\/issues\/(\d+)$/.exec(path)
        if (one !== null) {
          const n = Number(one[1])
          const rows = listed.exitCode === 0 ? (JSON.parse(listed.stdout) as { number: number }[]) : []
          const found = rows.find(r => r.number === n)
          if (found === undefined) return result(1, '', 'HTTP 404: Not Found')

          return result(0, JSON.stringify({ state: 'open', body: `Body of #${n}`, ...found, ...(options.ticket?.[n] ?? {}) }))
        }

        return result(1, '', 'unexpected gh call')
      }
      ghCalls.push(where)
      ghArgv.push([...e.argv])
      if (options.ghGate) await options.ghGate
      if (options.ghHold?.wait) await options.ghHold.wait

      return result(listed.exitCode, listed.stdout, listed.stderr)
    }
    if (e.argv.includes('get-url')) {
      const dir = norm(e.argv[e.argv.indexOf('-C') + 1] ?? '')
      const url = options.origins?.[dir] ?? `https://github.com/test/${dir.split('/').pop() ?? ''}.git`

      return url === '' ? result(2, '', 'error: No such remote') : result(0, `${url}
`)
    }
    if (e.argv.includes('for-each-ref')) {
      const dir = norm(e.argv[e.argv.indexOf('-C') + 1] ?? '')

      return result(0, (options.branches?.[dir] ?? []).join(String.fromCharCode(10)))
    }
    if (e.argv.includes('rev-parse')) {
      const dir = norm(e.argv[e.argv.indexOf('-C') + 1] ?? '')
      const top = repos[dir]

      return top === undefined ? result(128, '', 'not a git repository') : result(0, `${top}\n`)
    }
    if (e.argv.includes('symbolic-ref') && options.defaultBranch !== undefined) return result(0, `${options.defaultBranch}
`)
    if (e.argv.includes('--show-current')) return result(0, `${options.branch ?? 'main'}\n`)

    return result(1, '')
  })
  on('agent.spawn', (_, e) => {
    if (options.spawnThrows) throw new Error('spawn failed')
    const type = e.subagentType ?? (e as unknown as { subagent_type?: string }).subagent_type ?? ''
    if (options.unknownTypes?.includes(type)) return { deny: `unknown agent type ${type}` }
    spawns.push({
      // Engines before 2.1.330 spell it subagent_type.
      subagentType: e.subagentType ?? (e as unknown as { subagent_type?: string }).subagent_type,
      model: e.model,
      cwd: e.cwd === undefined ? undefined : norm(e.cwd),
      prompt: e.prompt,
      description: e.description,
    })

    return { model: e.model ?? 'sonnet', agentId: `agent-${spawns.length}` }
  })
  on('turn.complete', (_, e) => {
    if (e.agentId !== undefined) ended.add(e.agentId)

    return { text: '' }
  })
  on('tool.call', () => ({ result: 'ok' }))
  on('session.attach', (_, e) => ({ clientId: e.clientId }) as never)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  // The mod never themes the app: any call here is recorded.
  on('theme.set', () => {
    themeCalls.push('set')

    return { value: { isDrawn: true } } as never
  })
  on('theme.clear', () => {
    themeCalls.push('clear')

    return { value: { isDrawn: true } } as never
  })

  return { touched, spawns, ghCalls, ghArgv, ghOther, statuses, themeCalls, registered, opened, clock }
}

export const done = (agentId?: string) =>
  ({ answer: 'ok', durationMs: 5, isAborted: false, turnId: `t-${agentId ?? 'main'}`, reason: 'answer', agentId }) as const

// Lets work a hook left running unawaited settle: every stub answers at once.
declare const setTimeout: (fn: () => void, ms: number) => unknown

export const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0))

// Inputs the tests leave out are the engine's to fill; a cast says so.
export const loose = <T>(input: object) => input as unknown as T

export async function startIn($: Engine, cwd: string) {
  await $.session.start({ cwd, surface: 'desktop', isInteractive: true })
  await settle()
}

type Drawn = { findAll: (query: never) => Promise<readonly { props: Record<string, unknown> }[]>; find?: (query: never) => Promise<unknown> }

// Everything the desktop pane drew as SVG: the markup, and the alt texts.
export const drawn = async (ui: Drawn) =>
  (await ui.findAll({ type: 'Svg' } as never)).map(s => String(s.props.source)).join(' ')

export const alts = async (ui: Drawn) => (await ui.findAll({ type: 'Svg' } as never)).map(s => String(s.props.alt))

// Every string the pane drew as Text, in order.
// A section header reads as its name, its count and its drawn arrow: ▾ open, ▸ folded. The arrow's alt names
// its header: `Open · 3, open`.
const arrowsOf = async (ui: Drawn) => {
  const arrows = new Map<string, string>()

  for (const n of await ui.findAll({ type: 'Svg' } as never)) {
    const m = /^(.*), (open|folded)$/.exec(String(n.props.alt ?? ''))

    if (m !== null && !arrows.has(m[1] as string)) arrows.set(m[1] as string, m[2] === 'open' ? '▾' : '▸')
  }

  return arrows
}

export const texts = async (ui: Drawn) => {
  const arrows = await arrowsOf(ui)
  const all = (await ui.findAll({ type: 'Text' } as never)).map(t => String((t as { text?: unknown }).text ?? ''))

  return all.map(t => (arrows.has(t) ? `${t} ${arrows.get(t)}` : t))
}

// A header's title and its arrow, without any note after the title: `head(ui, 'fold:open')` is 'Open · 3 ▾'.
export const head = async (ui: Drawn & { find: (query: never) => Promise<unknown> }, foldKey: string): Promise<string> => {
  const button = (await ui.find({ key: foldKey } as never)) as { text?: unknown } | undefined

  if (button === undefined) return ''

  // The Button reads its title and any note after it (a milestone's progress); the arrow names the title.
  const text = String(button.text ?? '')
  const titles = [...(await arrowsOf(ui)).entries()].filter(([t]) => text === t || text.startsWith(`${t} · `))
  const [title, arrow] = titles.sort((a, b) => b[0].length - a[0].length)[0] ?? [text, undefined]

  return arrow === undefined ? text : `${title} ${arrow}`
}

// The keys of the issue rows (and building cards), in order.
export const issueKeys = async (ui: Drawn) =>
  (await ui.findAll({ type: 'Box' } as never)).map(b => String((b as { key?: unknown }).key)).filter(k => k.startsWith('issue:'))
