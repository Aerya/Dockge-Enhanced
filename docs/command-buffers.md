# Configurable command buffers

[en](command-buffers.md) · [fr](command-buffers.fr.md) · [de](command-buffers.de.md) · [es](command-buffers.es.md) · [zh-CN](command-buffers.zh-CN.md)

Captured command output limits can be adjusted with bounded environment settings. Overflow logs identify the command family, source location and limit without printing arguments or captured output. Existing defaults and streaming commands are preserved.

## Configuration

Set these variables on each Enhanced instance that executes commands. Helpers inherit the validated values. Invalid values fall back to the defaults with a warning; the supplied value is never logged. Restart/recreate Enhanced after changing its environment. The settings do not change timeouts, business log limits or streamed transfers.

| Variable | Default | Description |
| --- | --- | --- |
| `DOCKGE_COMMAND_BUFFER_MULTIPLIER` | `1` | Multiplier for existing capture limits (integer 1–16); increase cautiously: memory use grows per concurrent command. |
| `DOCKGE_COMMAND_BUFFER_MAX_MIB` | `256` | Hard ceiling per command, in MiB (integer 1–256). |

Defaults are 1 for the multiplier and 256 MiB for the ceiling. The effective limit is min(existing limit × multiplier, ceiling). Native execution usually starts at 1 MiB; captured promisify-child-process output at 200 KiB; stack volume inspection uses 4 MiB and keeps its small projected batches. Node native limits apply per output stream; promisify-child-process counts stdout and stderr together.

```yaml
environment:
  DOCKGE_COMMAND_BUFFER_MULTIPLIER: "2"
  DOCKGE_COMMAND_BUFFER_MAX_MIB: "256"
```

## Diagnostics

A maxBuffer or ENOBUFS failure emits one [commandBuffer] log with the source file/line, safe command family, original limit and effective limit in bytes. Arguments, environment values, absolute paths and captured output are not added to this diagnostic. The original failure still propagates; ordinary errors are not reclassified. Raising limits consumes more memory and does not replace bounded queries.
