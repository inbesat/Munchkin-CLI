with open('tests/integration.test.ts', 'r') as f:
    c = f.read()

# Fix the 'accepts valid bearer token' test to use the main authHeader
c = c.replace(
    """it('accepts valid bearer token', async () => {
      const { AuthStore } = await import('../src/auth/store')
      const store = new AuthStore({ baseDir: '/tmp' })
      await store.load()
      const { secret } = await store.createKey({ name: 'test-auth' })

      const res = await server.getApp().request('/api/sessions', {
        headers: { authorization: `Bearer ${secret}` },
      })
      expect(res.status).toBe(200)
    })""",
    """it('accepts valid bearer token', async () => {
      const res = await server.getApp().request('/api/sessions', {
        headers: { 'authorization': authHeader },
      })
      expect(res.status).toBe(200)
    })"""
)

with open('tests/integration.test.ts', 'w') as f:
    f.write(c)

print('done')