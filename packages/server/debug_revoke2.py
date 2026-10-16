with open('tests/integration.test.ts', 'r') as f:
    c = f.read()

# Find the revoke test
start = c.find("it('revokes an API key'")
if start >= 0:
    end = c.find('\n  })', c.find("it('revokes an API key'"))
    if end == -1:
        end = len(c)
    print("Found at:", start)
    print("End at:", end)
    print(c[start:start+500])

with open('debug_revoke.txt', 'w') as f:
    f.write(c[start:start+500])