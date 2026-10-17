# Privacy Policy

Forge is local-first: your code, prompts, sessions, and configuration stay on
your machine. The only data that can ever leave your machine is **opt-in,
anonymous usage telemetry**, and it is **off by default**.

## What telemetry collects

When you run `forge telemetry on`, Forge may send events such as:

| Event name        | Example properties                    | Purpose            |
| ----------------- | ------------------------------------- | ------------------ |
| `command.run`     | `command=eval`, `durationMs=12`       | feature usage      |
| `session.start`   | `model=claude-sonnet-4-6`, `provider=anthropic` | feature usage |
| `session.end`     | `turns=12`, `durationMs=34567`        | usage + performance |
| `tool.call`       | `tool=read`, `ok=true`                | feature usage      |
| `error`           | `kind=provider`, `code=rate_limit`    | error rates        |
| `performance`     | `durationMs=250`                      | performance        |

Each batch also carries a `schemaVersion` and a random anonymous install id
(`telemetry-id` in `~/.config/forge/`) that is not linked to your identity.
No account, email, or machine identifier is collected.

## What is never collected

- Code, file contents, diffs, or file names
- Prompts, messages, tool arguments, or command output
- File paths of any kind
- Personal data: names, emails, IP-derived identifiers (as with any network
  request, the receiving server necessarily sees the IP address that connects
  to it), hostnames, environment variables, or API keys

This is enforced in code, not just promised: every string in a telemetry event
must match `[A-Za-z0-9._-]{1,64}` (no whitespace, no path separators, no
colons) and event names must be lowercase dotted tokens. Anything that fails
validation is dropped before it can be buffered or sent
(`packages/core/src/telemetry/index.ts`).

## Where data goes

Events are sent over HTTPS to the configured endpoint (default:
`https://telemetry.forge.dev/v1/events`; override with `telemetry.endpoint` in
your config). Transmission is best-effort: failures never affect Forge's
behavior, and buffered events are bounded (100 max).

## How to opt out

Telemetry is disabled unless you enable it. To check or change the state:

```sh
forge telemetry status   # show current state and what is sent
forge telemetry off      # disable (writes telemetry.enabled=false to ~/.config/forge/settings.json)
```

Deleting `~/.config/forge/telemetry-id` resets your anonymous install id.

## Changes

This policy describes the implementation in this repository. If the collected
fields ever change, this document and the event validation in
`packages/core/src/telemetry/index.ts` change together in the same commit.
