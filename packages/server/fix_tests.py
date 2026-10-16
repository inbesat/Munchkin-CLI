import re

with open('packages/server/tests/integration.test.ts', 'r') as f:
    c = f.read()

replacements = [
    (
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools')",
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json', 'authorization': authHeader },\n      body: JSON.stringify({ model: 'auto' }),"
    ),
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
]

with open('packages/server/tests/integration.test.ts', 'r') as f:
    c = f.read()

for old, new in [
    (
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools')",
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
]

with open('packages/server/tests/integration.test.ts', 'r') as f:
    c = f.read()

for old, new in [
    (
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools')",
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
]

with open('packages/server/tests/integration.test.ts', 'r') as f:
    c = f.read()

replacements = [
    (
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools')",
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools', {\n      headers: { 'authorization': authHeader },\n    })"
    ),
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"
    ),
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
]

with open('packages/server/tests/integration.test.ts', 'r') as f:
    c = f.read()

for old, new in [
    ("it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools')",
     "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools', {\n      headers: { 'authorization': authHeader },\n    })"),
    ("it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
     "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"),
    ("it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
     "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"),
    ("it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
     "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"),
    ("it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
     "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    ("it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
     "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"),
    ("it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
     "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"),
    ("it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
     "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"),
    ("it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
     "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    ("it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
     "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"),
    ("it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
     "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"),
    ("it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
     "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"),
    ("it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
     "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
]

with open('packages/server/tests/integration.test.ts', 'r') as f:
    c = f.read()

for old, new in [
    ("it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools')",
     "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools', {\n      headers: { 'authorization': authHeader },\n    })"),
    ("it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
     "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"),
    ("it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
     "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"),
    ("it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
     "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"),
    ("it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
     "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
]

with open('packages/server/tests/integration.test.ts', 'r') as f:
    c = f.read()

for old, new in [
    ("it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools')",
     "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools', {\n      headers: { 'authorization': authHeader },\n    })"),
    ("it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
     "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"),
    ("it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
     "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"),
    ("it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
     "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"),
    ("it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
     "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
]

with open('packages/server/tests/integration.test.ts', 'r') as f:
    c = f.read()

for old, new in [
    ("it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools')",
     "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools', {\n      headers: { 'authorization': authHeader },\n    })"),
    ("it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
     "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"),
    ("it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
     "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"),
    ("it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
     "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n    })"),
    ("it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
     "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
]

with open('packages/server/tests/integration.test.ts', 'w') as f:
    f.write(c)

print('done')