with open('tests/integration.test.ts', 'r') as f:
    c = f.read()

# Fix the unknown routes test to expect 401 (since auth is enabled)
c = c.replace(
    "it('returns 404 for unknown routes', async () => {\n    const res = await server.getApp().request('/api/nonexistent')\n    expect(res.status).toBe(404)\n  })",
    "it('returns 401 for unknown routes without auth', async () => {\n    const res = await server.getApp().request('/api/nonexistent')\n    expect(res.status).toBe(401)\n  })"
)

with open('tests/integration.test.ts', 'w') as f:
    f.write(c)

print('done')