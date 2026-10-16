with open('packages/server/src/integration.test.ts', 'r') as f:
    c = f.read()

c = c.replace(
    "const { AuthStore } = await import('../auth/store')\n    const { AuthStore } = await import('../auth/store')",
    "const { AuthStore } = await import('./auth/store')"
)

with open('packages/server/src/integration.test.ts', 'w') as f:
    f.write(c)
print('done')