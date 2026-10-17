import { useState } from 'react'
import { ActivityIndicator, Button, StyleSheet, Text, TextInput, View } from 'react-native'
import type { ConnectionConfig } from '../config'
import { validateConnectionConfig } from '../config'

interface ConnectScreenProps {
  existing: ConnectionConfig | null
  /** Called with a validated config after a successful /health probe. */
  onConnected: (config: ConnectionConfig) => void
}

/** Server onboarding: URL + API key, probed with /health before handing off. */
export function ConnectScreen({ existing, onConnected }: ConnectScreenProps) {
  const [serverUrl, setServerUrl] = useState(existing?.serverUrl ?? '')
  const [token, setToken] = useState(existing?.token ?? '')
  const [name, setName] = useState(existing?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const connect = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    const candidate: ConnectionConfig = {
      serverUrl: serverUrl.trim(),
      token: token.trim(),
      ...(name.trim() !== '' ? { name: name.trim() } : {}),
    }
    const validation = validateConnectionConfig(candidate)
    if (!validation.ok) {
      setError(validation.error)
      setBusy(false)
      return
    }
    const { ForgeMobileApi } = await import('../api')
    const probe = await new ForgeMobileApi({
      baseUrl: validation.config.serverUrl,
      token: validation.config.token,
    }).connect()
    if (!probe.ok) {
      setError(probe.error)
      setBusy(false)
      return
    }
    onConnected(validation.config)
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>connect to forge</Text>
      <TextInput
        style={styles.input}
        placeholder="server URL (http://host:3000)"
        value={serverUrl}
        onChangeText={setServerUrl}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextInput
        style={styles.input}
        placeholder="API key (forge auth create)"
        value={token}
        onChangeText={setToken}
        secureTextEntry
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="name (optional)"
        value={name}
        onChangeText={setName}
      />
      {error !== undefined && <Text style={styles.error}>{error}</Text>}
      {busy ? <ActivityIndicator /> : <Button title="Connect" onPress={() => void connect()} />}
      <Text style={styles.hint}>
        Run `forge serve --host 0.0.0.0` on your machine, then connect from the same network.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#30363d', borderRadius: 8, padding: 12 },
  error: { color: '#f85149' },
  hint: { color: '#8b949e', marginTop: 16, fontSize: 12 },
})
