with open('tests/integration.test.ts', 'r') as f:
    c = f.read()

# Fix the specific test that's failing
c = c.replace(
    "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools')",
    "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools', {\n      headers: { 'authorization': authHeader },\n    })"
)

with open('tests/integration.test.ts', 'w') as f:
    f.write(c)

print('done')