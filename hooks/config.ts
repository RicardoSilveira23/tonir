// The person's settings (`userConfig` in plugin.json), read once per load of the hooks module.
// Every field falls back to its default when the stored value is missing or not one of the options.

export type Config = {
  isolation: 'worktree' | 'none'
  leadModel: 'opus' | 'sonnet' | 'haiku' | 'fable' | 'inherit'
  coderAgent: string
  validatorAgent: string
  trustedAuthors: 'members' | 'owner' | 'anyone'
  // lower-case folder names
  blockedFolders: string[]
  buildInstructions: string
  autoOpenAgents: 'on-spawn' | 'never'
  openBar: 'off' | 'on'
}

export const DEFAULTS: Config = {
  isolation: 'worktree',
  leadModel: 'opus',
  coderAgent: 'coder',
  validatorAgent: 'validator',
  trustedAuthors: 'members',
  blockedFolders: [],
  buildInstructions: '',
  autoOpenAgents: 'on-spawn',
  openBar: 'off',
}

type Options = Readonly<Record<string, unknown>> | undefined

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.find(a => a === value) ?? fallback

// An agent type name: letters, digits and `:_.-`, never anything a prompt could be widened with.
const agentName = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^[\w:.-]{1,64}$/.test(value.trim()) ? value.trim() : fallback

export function parseConfig(options: Options): Config {
  const o = options ?? {}

  return {
    isolation: pick(o.isolation, ['worktree', 'none'], DEFAULTS.isolation),
    leadModel: pick(o.leadModel, ['opus', 'sonnet', 'haiku', 'fable', 'inherit'], DEFAULTS.leadModel),
    coderAgent: agentName(o.coderAgent, DEFAULTS.coderAgent),
    validatorAgent: agentName(o.validatorAgent, DEFAULTS.validatorAgent),
    trustedAuthors: pick(o.trustedAuthors, ['members', 'owner', 'anyone'], DEFAULTS.trustedAuthors),
    blockedFolders:
      typeof o.blockedFolders === 'string'
        ? o.blockedFolders
            .split(',')
            .map(s => s.trim().toLowerCase())
            .filter(s => s !== '')
        : [],
    buildInstructions: typeof o.buildInstructions === 'string' ? o.buildInstructions.trim().slice(0, 4000) : '',
    autoOpenAgents: pick(o.autoOpenAgents, ['on-spawn', 'never'], DEFAULTS.autoOpenAgents),
    openBar: pick(o.openBar, ['off', 'on'], DEFAULTS.openBar),
  }
}

let current: Config = DEFAULTS

export const config = (): Config => current

export const setConfig = (options: Options): void => {
  current = parseConfig(options)
}
