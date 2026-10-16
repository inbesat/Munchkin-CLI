---
name: deployment
description: Pre-deploy checklist, rollback, and health verification.
triggers:
  - deploy
  - ship it
  - pre-deploy check
---

## Deployment protocol

1. Enumerate the change blast radius: services touched, migrations, feature flags, config keys.
2. Checklist before any deploy: CI green, migrations reversible, secrets present, health endpoint defined.
3. Plan rollback FIRST: the exact command that undoes the deploy, and how to verify the restore worked.
4. Prefer canary or staged rollout when the platform supports it; verify health checks between stages.
5. After deploy, watch error rate for one window; report `DEPLOY: ok|rolled-back` with evidence.
