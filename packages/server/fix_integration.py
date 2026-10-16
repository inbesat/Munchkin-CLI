import re

with open('tests/integration.test.ts', 'r') as f:
    c = f.read()

# 1. Add authHeader declaration after baseDir/server
c = c.replace(
    'let baseDir: string\nlet server: any',
    'let baseDir: string\nlet server: any\nlet authHeader: string'
)

# 2. In beforeAll, add authHeader creation
c = c.replace(
    "await authStore.createKey({ name: 'test-key', env: 'test' })",
    "const { secret } = await authStore.createKey({ name: 'test-key', env: 'test' })\n    authHeader = `Bearer ${secret}`"
)

# Define all replacements as (old, new) tuples
replacements = [
    # Session create with title
    (
        "const create = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ cwd: '/tmp', model: 'auto', title: 'integ test' }),",
        "const create = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ cwd: '/tmp', model: 'auto', title: 'integ test' }),"
    ),
    # Session create minimal
    (
        "const create = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ cwd: '/tmp', model: 'auto' }),",
        "const create = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ cwd: '/tmp', model: 'auto' }),"
    ),
    # Session get
    (
        "const get = await server.getApp().request(`/api/sessions/${session.id}`)",
        "const get = await server.getApp().request(`/api/sessions/${session.id}`, {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Session delete
    (
        "const del = await server.getApp().request(`/api/sessions/${session.id}`, { method: 'DELETE' })",
        "const del = await server.getApp().request(`/api/sessions/${session.id}`, { method: 'DELETE', headers: { 'authorization': authHeader } })"
    ),
    # Prompt
    (
        "const prompt = await server.getApp().request(`/api/prompts/${session.id}`, {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ prompt: 'Hello world' }),",
        "const prompt = await server.getApp().request(`/api/prompts/${session.id}`, {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ prompt: 'Hello world' }),"
    ),
    # Unknown session
    (
        "const prompt = await server.getApp().request('/api/prompts/unknown-id', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ prompt: 'test' }),",
        "const prompt = await server.getApp().request('/api/prompts/unknown-id', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ prompt: 'test' }),"
    ),
    # Tools execute bash
    (
        "const res = await server.getApp().request('/api/tools/execute', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ name: 'bash', args: { command: 'echo hello' } }),",
        "const res = await server.getApp().request('/api/tools/execute', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ name: 'bash', args: { command: 'echo hello' } }),"
    ),
    # Unknown tools
    (
        "const res = await server.getApp().request('/api/tools/execute', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ name: 'nonexistent', args: {} }),",
        "const res = await server.getApp().request('/api/tools/execute', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ name: 'nonexistent', args: {} }),"
    ),
    # Config POST
    (
        "const post = await server.getApp().request('/api/config', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ key: 'test.key', value: 'test-value' }),",
        "const post = await server.getApp().request('/api/config', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ key: 'test.key', value: 'test-value' }),"
    ),
    # Config GET
    (
        "const get = await server.getApp().request('/api/config/test.key')",
        "const get = await server.getApp().request('/api/config/test.key', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Config DELETE
    (
        "const del = await server.getApp().request('/api/config/delete.me', { method: 'DELETE' })",
        "const del = await server.getApp().request('/api/config/delete.me', { method: 'DELETE', headers: { 'authorization': authHeader } })"
    ),
    # Auth key create
    (
        "const res = await server.getApp().request('/api/auth/keys', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ name: 'integ-key', env: 'integ' }),",
        "const res = await server.getApp().request('/api/auth/keys', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ name: 'integ-key', env: 'integ' }),"
    ),
    # Auth keys list
    (
        "const res = await server.getApp().request('/api/auth/keys')",
        "const res = await server.getApp().request('/api/auth/keys', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Revoke
    (
        "const del = await server.getApp().request(`/api/auth/keys/${key.id}`, { method: 'DELETE' })",
        "const del = await server.getApp().request(`/api/auth/keys/${key.id}`, { method: 'DELETE', headers: { 'authorization': authHeader } })"
    ),
    # Auth GET
    (
        "const res = await server.getApp().request('/api/auth')",
        "const res = await server.getApp().request('/api/auth', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # SSE events
    (
        "const res = await server.getApp().request('/api/sse/events?sessions=')",
        "const res = await server.getApp().request('/api/sse/events?sessions=', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # OpenAPI spec
    (
        "const res = await server.getApp().request('/api/openapi.json')",
        "const res = await server.getApp().request('/api/openapi.json', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # CORS test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    # Validation error test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "const res = await server.getApp().request('/api/sse/stats')",
        "const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Config default
    (
        "const res = await server.getApp().request('/api/config/default')",
        "const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # CORS test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    # Validation error test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "const res = await server.getApp().request('/api/sse/stats')",
        "const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Config default
    (
        "const res = await server.getApp().request('/api/config/default')",
        "const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # CORS test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    # Validation error test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ model: 'auto' }),"
    ),
]

with open('tests/integration.test.ts', 'r') as f:
    c = f.read()

# Add authHeader declaration
c = c.replace(
    'let baseDir: string\nlet server: any',
    'let baseDir: string\nlet server: any\nlet authHeader: string'
)

# In beforeAll, add authHeader creation
c = c.replace(
    "await authStore.createKey({ name: 'test-key', env: 'test' })",
    "const { secret } = await authStore.createKey({ name: 'test-key', env: 'test' })\n    authHeader = `Bearer ${secret}`"
)

replacements = [
    # Session create with title
    (
        "const create = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ cwd: '/tmp', model: 'auto', title: 'integ test' }),",
        "const create = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ cwd: '/tmp', model: 'auto', title: 'integ test' }),"
    ),
    # Session create minimal
    (
        "const create = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ cwd: '/tmp', model: 'auto' }),",
        "const create = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ cwd: '/tmp', model: 'auto' }),"
    ),
    # Session get
    (
        "const get = await server.getApp().request(`/api/sessions/${session.id}`)",
        "const get = await server.getApp().request(`/api/sessions/${session.id}`, {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Session delete
    (
        "const del = await server.getApp().request(`/api/sessions/${session.id}`, { method: 'DELETE' })",
        "const del = await server.getApp().request(`/api/sessions/${session.id}`, { method: 'DELETE', headers: { 'authorization': authHeader } })"
    ),
    # Prompt
    (
        "const prompt = await server.getApp().request(`/api/prompts/${session.id}`, {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ prompt: 'Hello world' }),",
        "const prompt = await server.getApp().request(`/api/prompts/${session.id}`, {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ prompt: 'Hello world' }),"
    ),
    # Unknown session
    (
        "const prompt = await server.getApp().request('/api/prompts/unknown-id', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ prompt: 'test' }),",
        "const prompt = await server.getApp().request('/api/prompts/unknown-id', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ prompt: 'test' }),"
    ),
    # Tools execute bash
    (
        "const res = await server.getApp().request('/api/tools/execute', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ name: 'bash', args: { command: 'echo hello' } }),",
        "const res = await server.getApp().request('/api/tools/execute', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ name: 'bash', args: { command: 'echo hello' } }),"
    ),
    # Unknown tools
    (
        "const res = await server.getApp().request('/api/tools/execute', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ name: 'nonexistent', args: {} }),",
        "const res = await server.getApp().request('/api/tools/execute', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ name: 'nonexistent', args: {} }),"
    ),
    # Config POST
    (
        "const post = await server.getApp().request('/api/config', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ key: 'test.key', value: 'test-value' }),",
        "const post = await server.getApp().request('/api/config', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ key: 'test.key', value: 'test-value' }),"
    ),
    # Config GET
    (
        "const get = await server.getApp().request('/api/config/test.key')",
        "const get = await server.getApp().request('/api/config/test.key', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Config DELETE
    (
        "const del = await server.getApp().request('/api/config/delete.me', { method: 'DELETE' })",
        "const del = await server.getApp().request('/api/config/delete.me', { method: 'DELETE', headers: { 'authorization': authHeader } })"
    ),
    # Auth key create
    (
        "const res = await server.getApp().request('/api/auth/keys', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ name: 'integ-key', env: 'integ' }),",
        "const res = await server.getApp().request('/api/auth/keys', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ name: 'integ-key', env: 'integ' }),"
    ),
    # Auth keys list
    (
        "const res = await server.getApp().request('/api/auth/keys')",
        "const res = await server.getApp().request('/api/auth/keys', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Revoke
    (
        "const del = await server.getApp().request(`/api/auth/keys/${key.id}`, { method: 'DELETE' })",
        "const del = await server.getApp().request(`/api/auth/keys/${key.id}`, { method: 'DELETE', headers: { 'authorization': authHeader } })"
    ),
    # Auth GET
    (
        "const res = await server.getApp().request('/api/auth')",
        "const res = await server.getApp().request('/api/auth', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # SSE events
    (
        "const res = await server.getApp().request('/api/sse/events?sessions=')",
        "const res = await server.getApp().request('/api/sse/events?sessions=', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # OpenAPI spec
    (
        "const res = await server.getApp().request('/api/openapi.json')",
        "const res = await server.getApp().request('/api/openapi.json', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # CORS test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    # Validation error test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "const res = await server.getApp().request('/api/sse/stats')",
        "const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Config default
    (
        "const res = await server.getApp().request('/api/config/default')",
        "const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # CORS test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    # Validation error test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "const res = await server.getApp().request('/api/sse/stats')",
        "const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Config default
    (
        "const res = await server.getApp().request('/api/config/default')",
        "const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # CORS test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    # Validation error test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "const res = await server.getApp().request('/api/sse/stats')",
        "const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Config default
    (
        "const res = await server.getApp().request('/api/config/default')",
        "const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # CORS test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    # Validation error test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ model: 'auto' }),"
    ),
]

with open('tests/integration.test.ts', 'r') as f:
    c = f.read()

# Add authHeader declaration
c = c.replace(
    'let baseDir: string\nlet server: any',
    'let baseDir: string\nlet server: any\nlet authHeader: string'
)

# In beforeAll, add authHeader creation
c = c.replace(
    "await authStore.createKey({ name: 'test-key', env: 'test' })",
    "const { secret } = await authStore.createKey({ name: 'test-key', env: 'test' })\n    authHeader = `Bearer ${secret}`"
)

replacements = [
    # Session create with title
    (
        "const create = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ cwd: '/tmp', model: 'auto', title: 'integ test' }),",
        "const create = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ cwd: '/tmp', model: 'auto', title: 'integ test' }),"
    ),
    # Session create minimal
    (
        "const create = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ cwd: '/tmp', model: 'auto' }),",
        "const create = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ cwd: '/tmp', model: 'auto' }),"
    ),
    # Session get
    (
        "const get = await server.getApp().request(`/api/sessions/${session.id}`)",
        "const get = await server.getApp().request(`/api/sessions/${session.id}`, {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Session delete
    (
        "const del = await server.getApp().request(`/api/sessions/${session.id}`, { method: 'DELETE' })",
        "const del = await server.getApp().request(`/api/sessions/${session.id}`, { method: 'DELETE', headers: { 'authorization': authHeader } })"
    ),
    # Prompt
    (
        "const prompt = await server.getApp().request(`/api/prompts/${session.id}`, {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ prompt: 'Hello world' }),",
        "const prompt = await server.getApp().request(`/api/prompts/${session.id}`, {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ prompt: 'Hello world' }),"
    ),
    # Unknown session
    (
        "const prompt = await server.getApp().request('/api/prompts/unknown-id', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ prompt: 'test' }),",
        "const prompt = await server.getApp().request('/api/prompts/unknown-id', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ prompt: 'test' }),"
    ),
    # Tools execute bash
    (
        "const res = await server.getApp().request('/api/tools/execute', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ name: 'bash', args: { command: 'echo hello' } }),",
        "const res = await server.getApp().request('/api/tools/execute', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ name: 'bash', args: { command: 'echo hello' } }),"
    ),
    # Unknown tools
    (
        "const res = await server.getApp().request('/api/tools/execute', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ name: 'nonexistent', args: {} }),",
        "const res = await server.getApp().request('/api/tools/execute', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ name: 'nonexistent', args: {} }),"
    ),
    # Config POST
    (
        "const post = await server.getApp().request('/api/config', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ key: 'test.key', value: 'test-value' }),",
        "const post = await server.getApp().request('/api/config', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ key: 'test.key', value: 'test-value' }),"
    ),
    # Config GET
    (
        "const get = await server.getApp().request('/api/config/test.key')",
        "const get = await server.getApp().request('/api/config/test.key', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Config DELETE
    (
        "const del = await server.getApp().request('/api/config/delete.me', { method: 'DELETE' })",
        "const del = await server.getApp().request('/api/config/delete.me', { method: 'DELETE', headers: { 'authorization': authHeader } })"
    ),
    # Auth key create
    (
        "const res = await server.getApp().request('/api/auth/keys', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ name: 'integ-key', env: 'integ' }),",
        "const res = await server.getApp().request('/api/auth/keys', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ name: 'integ-key', env: 'integ' }),"
    ),
    # Auth keys list
    (
        "const res = await server.getApp().request('/api/auth/keys')",
        "const res = await server.getApp().request('/api/auth/keys', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Revoke
    (
        "const del = await server.getApp().request(`/api/auth/keys/${key.id}`, { method: 'DELETE' })",
        "const del = await server.getApp().request(`/api/auth/keys/${key.id}`, { method: 'DELETE', headers: { 'authorization': authHeader } })"
    ),
    # Auth GET
    (
        "const res = await server.getApp().request('/api/auth')",
        "const res = await server.getApp().request('/api/auth', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # SSE events
    (
        "const res = await server.getApp().request('/api/sse/events?sessions=')",
        "const res = await server.getApp().request('/api/sse/events?sessions=', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # OpenAPI spec
    (
        "const res = await server.getApp().request('/api/openapi.json')",
        "const res = await server.getApp().request('/api/openapi.json', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # CORS test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    # Validation error test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "const res = await server.getApp().request('/api/sse/stats')",
        "const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Config default
    (
        "const res = await server.getApp().request('/api/config/default')",
        "const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # CORS test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    # Validation error test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "const res = await server.getApp().request('/api/sse/stats')",
        "const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Config default
    (
        "const res = await server.getApp().request('/api/config/default')",
        "const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # CORS test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    # Validation error test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ model: 'auto' }),"
    ),
]

with open('tests/integration.test.ts', 'r') as f:
    c = f.read()

# Add authHeader declaration
c = c.replace(
    'let baseDir: string\nlet server: any',
    'let baseDir: string\nlet server: any\nlet authHeader: string'
)

# In beforeAll, add authHeader creation
c = c.replace(
    "await authStore.createKey({ name: 'test-key', env: 'test' })",
    "const { secret } = await authStore.createKey({ name: 'test-key', env: 'test' })\n    authHeader = `Bearer ${secret}`"
)

replacements = [
    # Session create with title
    (
        "const create = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ cwd: '/tmp', model: 'auto', title: 'integ test' }),",
        "const create = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ cwd: '/tmp', model: 'auto', title: 'integ test' }),"
    ),
    # Session create minimal
    (
        "const create = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ cwd: '/tmp', model: 'auto' }),",
        "const create = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ cwd: '/tmp', model: 'auto' }),"
    ),
    # Session get
    (
        "const get = await server.getApp().request(`/api/sessions/${session.id}`)",
        "const get = await server.getApp().request(`/api/sessions/${session.id}`, {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Session delete
    (
        "const del = await server.getApp().request(`/api/sessions/${session.id}`, { method: 'DELETE' })",
        "const del = await server.getApp().request(`/api/sessions/${session.id}`, { method: 'DELETE', headers: { 'authorization': authHeader } })"
    ),
    # Prompt
    (
        "const prompt = await server.getApp().request(`/api/prompts/${session.id}`, {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ prompt: 'Hello world' }),",
        "const prompt = await server.getApp().request(`/api/prompts/${session.id}`, {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ prompt: 'Hello world' }),"
    ),
    # Unknown session
    (
        "const prompt = await server.getApp().request('/api/prompts/unknown-id', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ prompt: 'test' }),",
        "const prompt = await server.getApp().request('/api/prompts/unknown-id', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ prompt: 'test' }),"
    ),
    # Tools execute bash
    (
        "const res = await server.getApp().request('/api/tools/execute', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ name: 'bash', args: { command: 'echo hello' } }),",
        "const res = await server.getApp().request('/api/tools/execute', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ name: 'bash', args: { command: 'echo hello' } }),"
    ),
    # Unknown tools
    (
        "const res = await server.getApp().request('/api/tools/execute', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ name: 'nonexistent', args: {} }),",
        "const res = await server.getApp().request('/api/tools/execute', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ name: 'nonexistent', args: {} }),"
    ),
    # Config POST
    (
        "const post = await server.getApp().request('/api/config', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ key: 'test.key', value: 'test-value' }),",
        "const post = await server.getApp().request('/api/config', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ key: 'test.key', value: 'test-value' }),"
    ),
    # Config GET
    (
        "const get = await server.getApp().request('/api/config/test.key')",
        "const get = await server.getApp().request('/api/config/test.key', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Config DELETE
    (
        "const del = await server.getApp().request('/api/config/delete.me', { method: 'DELETE' })",
        "const del = await server.getApp().request('/api/config/delete.me', { method: 'DELETE', headers: { 'authorization': authHeader } })"
    ),
    # Auth key create
    (
        "const res = await server.getApp().request('/api/auth/keys', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ name: 'integ-key', env: 'integ' }),",
        "const res = await server.getApp().request('/api/auth/keys', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ name: 'integ-key', env: 'integ' }),"
    ),
    # Auth keys list
    (
        "const res = await server.getApp().request('/api/auth/keys')",
        "const res = await server.getApp().request('/api/auth/keys', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Revoke
    (
        "const del = await server.getApp().request(`/api/auth/keys/${key.id}`, { method: 'DELETE' })",
        "const del = await server.getApp().request(`/api/auth/keys/${key.id}`, { method: 'DELETE', headers: { 'authorization': authHeader } })"
    ),
    # Auth GET
    (
        "const res = await server.getApp().request('/api/auth')",
        "const res = await server.getApp().request('/api/auth', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # SSE events
    (
        "const res = await server.getApp().request('/api/sse/events?sessions=')",
        "const res = await server.getApp().request('/api/sse/events?sessions=', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # OpenAPI spec
    (
        "const res = await server.getApp().request('/api/openapi.json')",
        "const res = await server.getApp().request('/api/openapi.json', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # CORS test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    # Validation error test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "const res = await server.getApp().request('/api/sse/stats')",
        "const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Config default
    (
        "const res = await server.getApp().request('/api/config/default')",
        "const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # CORS test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    # Validation error test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "const res = await server.getApp().request('/api/sse/stats')",
        "const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # Config default
    (
        "const res = await server.getApp().request('/api/config/default')",
        "const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    # CORS test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    # Validation error test
    (
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ model: 'auto' }),"
    ),
]

with open('tests/integration.test.ts', 'r') as f:
    c = f.read()

# Add authHeader declaration
c = c.replace(
    'let baseDir: string\nlet server: any',
    'let baseDir: string\nlet server: any\nlet authHeader: string'
)

# In beforeAll, add authHeader creation
c = c.replace(
    "await authStore.createKey({ name: 'test-key', env: 'test' })",
    "const { secret } = await authStore.createKey({ name: 'test-key', env: 'test' })\n    authHeader = `Bearer ${secret}`"
)

for old, new in replacements:
    if old in c:
        c = c.replace(old, new)
    else:
        print('NOT FOUND:', repr(old[:80]))

with open('tests/integration.test.ts', 'w') as f:
    f.write(c)

print('done')