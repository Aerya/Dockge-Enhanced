[English](configuration-tools.md) · [Français](configuration-tools.fr.md) · [Deutsch](configuration-tools.de.md) · [Español](configuration-tools.es.md) · [简体中文](configuration-tools.zh-CN.md)

# Configuration tools

Prepared on this branch; not yet published in `main`/`latest`.

Stack actions → **Files and history** provides revisions and **View saved merged Compose**. This runs `docker compose config` on the owning instance, including overrides and variables but not unsaved drafts. It may expose secrets: administrator access and confirmation are required.

The last 20 distinct file revisions are retained before saves or Git pulls: Compose, override and `.env`, or the registered file chain for external stacks. Application data, indirectly included files and shared `global.env` are not versioned here. Each file is limited to 2 MiB. A history failure blocks the write to protect the previous version.

Revisions are encrypted in `stack-file-history/` under Enhanced’s data directory. Back up it and `stack-file-history.key` together; losing the key makes revisions unreadable. Revision lists contain no file contents. Restore first preserves current files, also restores the absence of an old override, and never restarts containers. **Review, then explicitly deploy.** A changed file list or concurrent operation blocks restoration.

The stack and global `.env` editors offer **Form mode**. Values are masked by default and remain literal, including quotes. Keep text mode for comments, complex lines and multiline values.

**Settings → Instance diagnostics** checks Docker, Compose, Git, Buildx and creation/removal of a temporary file in data and stacks directories. Select a linked instance to examine it. No configuration, deployment or cleanup is performed.

Update both ends of linked instances. Older agents show an unavailable result after a bounded timeout. Restricted users cannot access these files/results or restore revisions. Keep Restic/Zerobyte backups for application data.

[ethanpil/dockge-mod](https://github.com/ethanpil/dockge-mod) — inspiration for file history, merged Compose, the `.env` form and diagnostics.
