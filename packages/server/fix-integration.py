import re

with open('tests/integration.test.ts', 'r') as f:
    c = f.read()

# 1. Add authHeader variable declaration
c = c.replace(
    'let baseDir: string\nlet server: any',
    'let baseDir: string\nlet server: any\nlet authHeader: string'
)

# 2. In beforeAll, capture the auth header
old_before = '''    await authStore.createKey({ name: 'test-key', env: 'test' })

    server = await ForgeServer.create({'''
new_before = '''    const { secret } = await authStore.createKey({ name: 'test-key', env: 'test' })
    authHeader = `Bearer ${secret}`

    server = await ForgeServer.create({'''
c = c.replace(old_before, new_before)

# 3. Replace requests that need auth with authenticated versions
# Session creation
c = c.replace(
    'const create = await server.getApp().request(\'/api/sessions\', {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\' },\n      body: JSON.stringify({ cwd: \'/tmp\', model: \'auto\', title: \'integ test\' }),',
    'const create = await server.getApp().request(\'/api/sessions\', {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\', \'authorization\': authHeader },\n      body: JSON.stringify({ cwd: \'/tmp\', model: \'auto\', title: \'integ test\' }),'
)

# Session create (minimal)
c = c.replace(
    'const create = await server.getApp().request(\'/api/sessions\', {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\' },\n      body: JSON.stringify({ cwd: \'/tmp\', model: \'auto\' }),',
    'const create = await server.getApp().request(\'/api/sessions\', {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\', \'authorization\': authHeader },\n      body: JSON.stringify({ cwd: \'/tmp\', model: \'auto\' }),'
)

# Session get
c = c.replace(
    'const get = await server.getApp().request(`\${session.id}`)',
    'const get = await server.getApp().request(`/api/sessions/${session.id}`, {\n      headers: { \'authorization\': authHeader },\n    })'
)

# Session delete
c = c.replace(
    'const del = await server.getApp().request(`/api/sessions/${session.id}`, { method: \'DELETE\' })',
    'const del = await server.getApp().request(`/api/sessions/${session.id}`, { method: \'DELETE\', headers: { \'authorization\': authHeader } })'
)

# Prompt
c = c.replace(
    'const prompt = await server.getApp().request(`/api/prompts/${session.id}`, {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\' },\n      body: JSON.stringify({ prompt: \'Hello world\' }),',
    'const prompt = await server.getApp().request(`/api/prompts/${session.id}`, {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\', \'authorization\': authHeader },\n      body: JSON.stringify({ prompt: \'Hello world\' }),'
    )

# Unknown session
c = c.replace(
    'const prompt = await server.getApp().request(\'/api/prompts/unknown-id\', {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\' },\n      body: JSON.stringify({ prompt: \'test\' }),',
    'const prompt = await server.getApp().request(\'/api/prompts/unknown-id\', {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\', \'authorization\': authHeader },\n      body: JSON.stringify({ prompt: \'test\' }),'
    )

# Tools execute
c = c.replace(
    'const res = await server.getApp().request(\'/api/tools/execute\', {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\' },\n      body: JSON.stringify({ name: \'bash\', args: { command: \'echo hello\' } }),',
    'const res = await server.getApp().request(\'/api/tools/execute\', {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\', \'authorization\': authHeader },\n      body: JSON.stringify({ name: \'bash\', args: { command: \'echo hello\' } }),'
)

# Unknown tools
c = c.replace(
    'const res = await server.getApp().request(\'/api/tools/execute\', {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\' },\n      body: JSON.stringify({ name: \'nonexistent\', args: {} }),',
    'const res = await server.getApp().request(\'/api/tools/execute\', {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\', \'authorization\': authHeader },\n      body: JSON.stringify({ name: \'nonexistent\', args: {} }),'
    )

# Config POST
c = c.replace(
    'const post = await server.getApp().request(\'/api/config\', {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\' },\n      body: JSON.stringify({ key: \'test.key\', value: \'test-value\' }),',
    'const post = await server.getApp().request(\'/api/config\', {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\', \'authorization\': authHeader },\n      body: JSON.stringify({ key: \'test.key\', value: \'test-value\' }),'
)

# Config GET
c = c.replace(
    'const get = await server.getApp().request(\'/api/config/test.key\')',
    'const get = await server.getApp().request(\'/api/config/test.key\', {\n      headers: { \'authorization\': authHeader },\n    })'
)

# Config DELETE
c = c.replace(
    'const del = await server.getApp().request(\'/api/config/delete.me\', { method: \'DELETE\' })',
    'const del = await server.getApp().request(\'/api/config/delete.me\', { method: \'DELETE\', headers: { \'authorization\': authHeader } })'
)

# Auth key create
c = c.replace(
    'const res = await server.getApp().request(\'/api/auth/keys\', {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\' },\n      body: JSON.stringify({ name: \'integ-key\', env: \'integ\' }),',
    'const res = await server.getApp().request(\'/api/auth/keys\', {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\', \'authorization\': authHeader },\n      body: JSON.stringify({ name: \'integ-key\', env: \'integ\' }),'
)

# Auth keys list
c = c.replace(
    'const res = await server.getApp().request(\'/api/auth/keys\')',
    'const res = await server.getApp().request(\'/api/auth/keys\', {\n      headers: { \'authorization\': authHeader },\n    })'
)

# Revoke
c = c.replace(
    'const del = await server.getApp().request(`/api/auth/keys/${key.id}`, { method: \'DELETE\' })',
    'const del = await server.getApp().request(`/api/auth/keys/${key.id}`, { method: \'DELETE\', headers: { \'authorization\': authHeader } })'
)

# Auth GET
c = c.replace(
    'const res = await server.getApp().request(\'/api/auth\')',
    'const res = await server.getApp().request(\'/api/auth\', {\n      headers: { \'authorization\': authHeader },\n    })'
)

# SSE events
c = c.replace(
    'const res = await server.getApp().request(\'/api/sse/events?sessions=\')',
    'const res = await server.getApp().request(\'/api/sse/events?sessions=\', {\n      headers: { \'authorization\': authHeader },\n    })'
)

# Auth middleware tests - these need authHeader
# The "rejects requests without token when key exists" should stay as 401
# The "accepts valid bearer token" already uses a different client

# OpenAPI spec - needs auth
c = c.replace(
    'const res = await server.getApp().request(\'/api/openapi.json\')',
    'const res = await server.getApp().request(\'/api/openapi.json\', {\n      headers: { \'authorization\': authHeader },\n    })'
)

# Docs - public
# CORS test - needs auth
c = c.replace(
    'const res = await server.getApp().request(\'/api/sessions\', {\n      headers: { origin: \'http://evil.com\' },\n    })',
    'const res = await server.getApp().request(\'/api/sessions\', {\n      headers: { origin: \'http://evil.com\', \'authorization\': authHeader },\n    })'
)

# Error handling - validation error test
c = c.replace(
    'const res = await server.getApp().request(\'/api/sessions\', {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\' },\n      body: JSON.stringify({ model: \'auto\' }),',
    'const res = await server.getApp().request(\'/api/sessions\', {\n      method: \'POST\',\n      headers: { \'content-type\': \'application/json\', \'authorization\': authHeader },\n      body: JSON.stringify({ model: \'auto\' }),'
)

# SSE stats
c = c.replace(
    'const res = await server.getApp().request(\'/api/sse/stats\')',
    'const res = await server.getApp().request(\'/api/sse/stats\', {\n      headers: { \'authorization\': authHeader },\n    })'
)

# Config default
c = c.replace(
    'const res = await server.getApp().request(\'/api/config/default\')',
    'const res = await server.getApp().request(\'/api/config/default\', {\n      headers: { \'authorization\': authHeader },\n    })'
)

# CORS test
c = c.replace(
    'const res = await server.getApp().request(\'/api/sessions\', {\n      headers: { origin: \'http://evil.com\' },\n    })',
    'const res = await server.getApp().request(\'/api/sessions\', {\n      headers: { origin: \'http://evil.com\', \'authorization\': authHeader },\n    })'
)

with open('tests/integration.test.ts', 'w') as f:
    f.write(c)
print('done')
"