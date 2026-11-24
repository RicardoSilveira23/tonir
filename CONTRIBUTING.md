# Contributing

Tonir is a one-person project. The changes to this repository are made by its maintainer, so pull
requests are open to collaborators only. You can still help:

- **Report a bug or suggest an idea** in [Issues](https://github.com/RicardoSilveira23/tonir/issues/new/choose).
  For a bug, say which Tonir version you run (`/plugin` shows it) and which Claude Code version.
- **Report a security problem privately**, as [SECURITY.md](SECURITY.md) says, never in a
  public issue.
- **Fork it.** Tonir is free software under the [GPL-3.0-or-later](LICENSE), so you can change it
  however you like. Any copy you hand out, changed or not, keeps the same licence and comes with
  its source. [Building from source](README.md#building-from-source) has the steps.

Not every idea gets built, and a reply can take a few days.

Before a push, `node scripts/check-exposure.mjs` checks the tracked files. It refuses 32-digit
hexadecimal ids, GUIDs, email addresses, folders under a user's home or under a `Dev` folder on
a drive, and words that name a PC or a hosting subdomain.
`node scripts/check-exposure.mjs --commits <range>` refuses commits whose author or committer
address is not a GitHub no-reply address.
