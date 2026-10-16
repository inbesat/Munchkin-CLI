with open('packages/server/src/integration.test.ts', 'r') as f:
    c = f.read()

# Fix the extra closing paren
c = c.replace(
    "  )\n\n  // ── Session lifecycle ──",
    "  })\n\n  // ── Session lifecycle ──"
)

with open('packages/server/src/integration.test.ts', 'w') as f:
    f.write(c)
print('done')