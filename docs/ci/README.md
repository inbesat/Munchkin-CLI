# forge CI review integration

Label-triggered agent reviews: adding the `forge-review` label to a pull
request (or merge request) makes forge post a deterministic review comment
(risk level, secret smells, debug residue, coverage hints) - the same
`reviewDiff` heuristics as the Phase-133 `ReviewPR` tool.

## GitHub Actions

1. Copy `.github/workflows/forge-review.yml` into the target repository (it
   lives here already for this repo).
2. Create a fine-grained PAT with **pull requests: write** and add it as the
   `FORGE_GH_TOKEN` repository secret. The built-in `GITHUB_TOKEN` also works
   if the workflow's `pull-requests: write` permission is sufficient.
3. Create the `forge-review` label.
4. Add the label to any PR - forge reviews it and posts the comment.

## GitLab CI

1. Include `docs/ci/forge-review.gitlab-ci.yml` from your project's
   `.gitlab-ci.yml` (see the header comment for the remote include URL).
2. Add a `FORGE_GH_TOKEN` CI/CD variable (protected).
3. Add the `forge-review` label to a merge request - the `forge-review` job
   runs and posts the comment using `gh` (install `glab` and swap the last
   step if you prefer the GitLab CLI).

## Env contract (both platforms)

| Variable | Purpose |
| --- | --- |
| `FORGE_PR_NUMBER` | Explicit PR/MR number (optional; CI context is auto-detected) |
| `FORGE_GH_TOKEN` | Token used for `gh` API calls |
| `GITHUB_REF` / `CI_MERGE_REQUEST_IID` | Pipeline context for PR resolution |
