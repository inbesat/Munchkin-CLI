---
name: security-review
description: Severity-ranked security review mapped to OWASP Top 10.
triggers:
  - security review
  - review security
  - audit the diff
---

## Security review protocol

1. Collect the changed files (`git diff --name-only HEAD`) and read each fully.
2. Map every finding to an OWASP Top 10 category (A01 Broken Access Control, A02 Cryptographic Failures, A03 Injection, ...).
3. For each finding record: file:line, OWASP category, severity (critical/high/medium/low), and a minimal fix.
4. Check specifically for: hardcoded secrets, unvalidated user input, SQL built by string concatenation,
   missing auth on new endpoints, dangerouslySetInnerHTML equivalents, and error messages leaking internals.
5. Rank findings critical > high > medium > low. Never pad the list ? "no findings" is a valid result.
6. Finish with a verdict line: `SECURITY: <n> findings (<critical> critical, <high> high)`.
