with open('tests/integration.test.ts', 'r') as f:
    c = f.read()

# Fix all missing authHeader headers
replacements = [
    # GET /api/tools
    ("it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools')",
     "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools', {\n      headers: { 'authorization': authHeader },\n    })"),
    
    # GET /api/sse/stats
    ("it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
     "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"),
    
    # GET /api/config/default
    ("it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
     "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"),
    
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validates request bodies
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    # Config default
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validation error test
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
]

with open('tests/integration.test.ts', 'r') as f:
    c = f.read()

# Add authHeader declaration if not present
if 'let authHeader: string' not in c:
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
    # GET /api/tools
    (
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools')",
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    # GET /api/sse/stats
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # GET /api/config/default
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validates request bodies
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # Config default
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validation error test
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # Config default
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validation error test
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
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
    # GET /api/tools
    (
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools')",
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools', {\n      headers: { 'authorization': authHeader },\n      })"
    ),
    # GET /api/sse/stats
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # GET /api/config/default
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validates request bodies
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # Config default
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validation error test
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # Config default
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validation error test
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # Config default
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validation error test
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
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
    # GET /api/tools
    (
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools')",
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # GET /api/sse/stats
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # GET /api/config/default
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validates request bodies
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # Config default
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validates request bodies
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # Config default
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validation error test
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # Config default
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validation error test
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
    # SSE stats
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # Config default
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validation error test
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
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
    # GET /api/tools
    (
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools')",
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # GET /api/sse/stats
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # GET /api/config/default
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validates request bodies
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
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
    # GET /api/tools
    (
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools')",
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # GET /api/sse/stats
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # GET /api/config/default
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validates request bodies
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
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
    # GET /api/tools
    (
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools')",
        "it('GET /api/tools lists all tools', async () => {\n      const res = await server.getApp().request('/api/tools', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # GET /api/sse/stats
    (
        "it('GET /api/sse/stats returns hub stats', async () => {\n    const res = await server.getApp().request('/api/sse/stats')",
        "it('GET /api/sse/stats returns hub stats', async () => {\n      const res = await server.getApp().request('/api/sse/stats', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # GET /api/config/default
    (
        "it('GET /api/config/default returns defaults', async () => {\n    const res = await server.getApp().request('/api/config/default')",
        "it('GET /api/config/default returns defaults', async () => {\n      const res = await server.getApp().request('/api/config/default', {\n      headers: { 'authorization': authHeader },\n        })"
    ),
    # CORS test
    (
        "it('adds CORS to all API routes', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com' },\n    })",
        "it('adds CORS to all API routes', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n      headers: { origin: 'http://evil.com', 'authorization': authHeader },\n      })"
    ),
    # Validates request bodies
    (
        "it('validates request bodies', async () => {\n    const res = await server.getApp().request('/api/sessions', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({ model: 'auto' }),",
        "it('validates request bodies', async () => {\n      const res = await server.getApp().request('/api/sessions', {\n          method: 'POST',\n          headers: { 'content-type': 'application/json', 'authorization': authHeader },\n          body: JSON.stringify({ model: 'auto' }),"
    ),
]

with open('tests/integration.test.ts', 'w') as f:
    f.write(c)

print('done')