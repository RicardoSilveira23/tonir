// color: the label hex colour without #, empty when unknown
export type IssueLabel = { name: string; color?: string }
export type Issue = {
  // the repository the issue belongs to
  repo: string
  number: number
  title: string
  url: string
  updatedAt: string
  labels: IssueLabel[]
  // the GitHub repository it lives in, owner/name, as the repo's origin remote names it
  slug: string
  // the login of whoever opened it, and GitHub's relation of that person to the repo (OWNER, MEMBER, CONTRIBUTOR, NONE, ...)
  author: string
  association: string
  // the milestone, when the issue has one: its due date (ISO, '' when none) and its open and closed counts
  // true when the repo has a local branch named issue-<n>-...
  isBranchReady?: boolean
  milestone?: { title: string; dueOn: string; open: number; closed: number }
}

// one: a single repo; all: every repo found under the session folder; none: nothing found
export type IssuesMode = 'none' | 'one' | 'all'

export type IssuesView = {
  mode: IssuesMode
  // one: the repo; all: the folder searched
  repo: string
  // why it was picked: 'session folder', 'files in use', 'pinned', 'all repos under <folder>'
  reason: string
  // current branch of the repo (one), '' when unknown
  branch: string
  // current branch per repo (all)
  branches: Record<string, string>
  // repos found under the session folder, for the Select
  repos: string[]
  items: Issue[]
  // repos in all mode that had no issues or no GitHub remote
  skipped: number
  // one muted line when gh could not list (no remote, not signed in, ...)
  error: string
  // one: the GitHub repository listed, owner/name; '' otherwise
  slug: string
  isLoading: boolean
  // true from session start until the first repo pick has resolved
  isChecking: boolean
}

// What the session tells us about where it works.
export type Focus = {
  // the session's working directory
  cwd: string
  // the directory of the most recent file or Bash cwd the session touched
  lastDir: string
  // issue numbers the person mentioned as #n, newest last
  refs: number[]
  // a repo the person picked in the Select; '' means all repos
  pinned: string
  // true once the person has used the Select this session, so a touched file no longer picks the repo
  hasPicked: boolean
}

export type BuildStage = 'queued' | 'running' | 'building' | 'validating' | 'done' | 'failed'
export type Build = {
  repo: string
  // the GitHub repository, owner/name; the ticket is read from it again when a later agent starts
  slug: string
  number: number
  title: string
  branch: string
  stage: BuildStage
  // true when the lead could not nest agents: coder, then validator
  isFallback: boolean
  agentId: string
  // the description the agent was spawned with
  label: string
  note: string
  // when the build was queued, in clock milliseconds; a queued build stuck for long may be pressed again
  startedAt: number
}

export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
  // prompt tokens (input, cache reads and writes) and the cache-read part, for the cache share
  promptTokens: number
  cacheRead: number
  round: number
  /** Self-reported by the worker through the `step` tool. */
  stepDone?: number
  stepTotal?: number
  stepNote?: string
  /** True for Tonir's own build agents and the subagents they start: the ones asked to report steps. */
  isBriefed?: boolean
}

export type Panel = {
  // true once the engine has answered the first agent list
  isListed: boolean
}

// What the Issues pane has folded or shown in full, and what the person searched for.
export type IssuesUi = {
  // section names: building, session, open
  folded: string[]
  expanded: string[]
  search: string
  // when the person first pressed "Build again" on an issue, in clock milliseconds, by build key
  armed: Record<string, number>
}

// The main session's own usage, summed over its turns.
export type MainUsage = {
  cost: number
  // prompt tokens (input, cache reads and writes) plus output
  tokens: number
  input: number
  cacheRead: number
  // when the session's clock started, in clock milliseconds; 0 before it is known
  startedAt: number
  // the main loop's latest model request: its prompt size, its model's window and the model
  contextTokens: number
  contextMax: number
  model: string
  // true from the main loop's first model request of a turn until the turn completes
  isRunning: boolean
}

declare module 'claude-code' {
  interface PluginState {
    tonir: {
      issues: Shaped<IssuesView>
      focus: Shaped<Focus>
      builds: Shaped<Record<string, Build>>
      agents: Shaped<AgentRun[]>
      panel: Shaped<Panel>
      mainUsage: Shaped<MainUsage>
      issuesUi: Shaped<IssuesUi>
      now: number
    }
  }
}
