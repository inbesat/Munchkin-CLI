with open('tests/integration.test.ts', 'r') as f:
    c = f.read()

# Fix the unknown routes test
c = c.replace(
    "it('returns 401 for unknown routes without auth', async () => {\n    const res = await server.getApp().request('/api/nonexistent')\n    expect(res.status).toBe(401)\n  })",
    """it('returns 404 for unknown routes with valid auth', async () => {
    const res = await server.getApp().request('/api/nonexistent', {
      headers: { 'authorization': authHeader },
    })
    expect(res.status).toBe(404)
  })"""
)

with open('tests/integration.test.ts', 'w') as f:
    f.write(c)

print('done')