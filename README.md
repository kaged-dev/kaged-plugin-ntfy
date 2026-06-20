<div align="center">

<img src="https://kaged.dev/hero.svg" alt="kaged" width="100%" />

# 影 @kaged/plugin-ntfy

**shadow ops for your `[attention]`**

A [kaged](https://kaged.dev) system plugin that delivers session notifications to a self-hostable [ntfy.sh](https://ntfy.sh) instance — `attention.required` and `run.completed` events routed through kaged's notification pipeline when the operator has zero live WebSocket connections.

[![npm](https://img.shields.io/npm/v/@kaged/plugin-ntfy?color=FFB000&label=npm&labelColor=0A0A0B)](https://www.npmjs.com/package/@kaged/plugin-ntfy)
[![license](https://img.shields.io/badge/license-MIT-FF2E63?labelColor=0A0A0B)](#license)
[![plugin](https://img.shields.io/badge/plugin-system-00E0FF&labelColor=0A0A0B)](#what-it-is)

</div>

---

## what it is

kaged emits two notification event classes per [ADR-0047](https://github.com/kaged-dev/monorepo/blob/main/docs/adr/0047-session-notifications.md): `attention.required` (checkpoint / ask / approval gate) and `run.completed`. When the operator has no live WebSocket connection, those events fan out to **tier-3 channels**. This plugin registers an ntfy channel via the `notification.channel.register` system-plugin hook.

- **Self-hostable** — point at your own ntfy instance, or use the public `https://ntfy.sh`.
- **Priority mapping** — `attention.required` defaults to `urgent`, `run.completed` to `low`.
- **Per-project topic override** — routing-channel config can override `topic` per project without running a second plugin instance.
- **Bearer-token auth** — protected-topic support via `auth_token` or `auth_token_env`.
- **Retry with backoff** — 429 / 5xx / network failures retry up to `retry_count` times.

## configure

In the daemon's `local.toml`:

```toml
[system_plugins."@kaged/plugin-ntfy"]
enabled = true

[system_plugins."@kaged/plugin-ntfy".config]
server = "https://ntfy.example.com"
topic  = "kaged-operator-abc123"        # hard-to-guess topic name
# auth_token_env = "NTFY_TOKEN"         # optional, for protected topics
```

Per ADR-0047, declare ntfy as eligible for whichever event classes you want pushed:

```toml
[notifications.routing.attention_required.ntfy]
# eligible (default config); override topic per-project via project.local.yaml

[notifications.routing.run_completed.ntfy]
# opt into run-completion pushes (off by default)
```

| Field | Type | Default | Description |
|---|---|---|---|
| `server` | string | — (required) | ntfy instance base URL (HTTPS enforced) |
| `topic` | string | — (required) | topic name; no whitespace or `/` |
| `auth_token_env` | string | — | env var name holding bearer token |
| `auth_token` | string | — | inline bearer token (prefer `*_env`) |
| `priority_attention` | `default` \| `high` \| `urgent` | `urgent` | ntfy priority for `attention.required` |
| `priority_completion` | `min` \| `low` \| `default` \| `high` | `low` | ntfy priority for `run.completed` |
| `click_base_url` | string | — | origin prepended to event `deep_link` for the ntfy `Click` action |
| `timeout_ms` | integer | `5000` (clamped 1000–30000) | per-request timeout |
| `retry_count` | integer | `2` (clamped 0–5) | retries on transient failure |
| `retry_delay_ms` | integer | `1000` (clamped 100–10000) | base retry delay |

Full spec: [`docs/specs/plugins/ntfy.md`](https://github.com/kaged-dev/monorepo/blob/main/docs/specs/plugins/ntfy.md).

## development

```bash
bun install
bun test
bun run typecheck
bun run format      # biome
```

Type imports come from [`@kaged/plugin-types`](https://www.npmjs.com/package/@kaged/plugin-types) (devDependency — erased at runtime).

## release

Bump `version` in `package.json`, tag `v<version>`, push the tag. CI verifies the tag matches, runs the suite, and publishes to npm with provenance.

---

## license

MIT © the kaged project

<div align="center">

`[kaged]` · [kaged.dev](https://kaged.dev) · *sanctioned edge, sacred code*

</div>
