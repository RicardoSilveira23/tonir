# Security

## Reporting a problem

Report it privately through GitHub's
[form](https://github.com/RicardoSilveira23/tonir/security/advisories/new), never in a public
issue. Tonir is a one-person project, so replies come when they can, usually within a week.

## Supported versions

Only the latest version gets fixes.

## What matters most

Tonir turns GitHub issues into work that agents do on your machine, so these matter most:

- An issue's text reaches a build's agents. Build is never pressed for you, and only open issues
  by authors you trust (`trustedAuthors`), in repos your GitHub account can push to, can be
  built. Tonir reads the issue again at the press and hands the agents its title and body in the
  prompt; they are told to read nothing else of GitHub's for it. Telling is not enforcing: the
  agents run with your session's permissions, so those permissions are what holds them.
- A build works in a git worktree of its own (`isolation`): Claude Code makes it where it can
  isolate a plugin's agent, and otherwise the lead is told to make one. The lead is told to
  commit locally and never push or open a pull request.
- Tonir reaches GitHub only through your own `gh` sign-in, and names the repository the
  `origin` remote names; it makes no network calls of its own and stores no token.
- Tonir never reads, lists or builds in a folder in `blockedFolders`, and names those folders to
  the build agents as off limits.

The README's section [What it runs, what it sends](README.md#what-it-runs-what-it-sends) has the
detail.
