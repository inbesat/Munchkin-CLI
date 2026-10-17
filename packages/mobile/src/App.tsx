import AsyncStorage from '@react-native-async-storage/async-storage'
import { type ReactElement, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ForgeMobileApi } from './api'
import {
  type ConnectionConfig,
  type ConnectionStorage,
  clearConnection,
  loadConnection,
  saveConnection,
} from './config'
import { ConnectScreen } from './screens/ConnectScreen'
import { SessionScreen } from './screens/SessionScreen'
import { SessionsScreen } from './screens/SessionsScreen'

/** AsyncStorage satisfies the ConnectionStorage KV surface structurally. */
const storage: ConnectionStorage = AsyncStorage

type Screen = { name: 'sessions' } | { name: 'session'; sessionId: string }

export default function App(): ReactElement {
  const [restoring, setRestoring] = useState(true)
  const [config, setConfig] = useState<ConnectionConfig | null>(null)
  const [api, setApi] = useState<ForgeMobileApi | null>(null)
  const [screen, setScreen] = useState<Screen>({ name: 'sessions' })

  useEffect(() => {
    void (async () => {
      const loaded = await loadConnection(storage)
      setRestoring(false)
      if (loaded.ok && loaded.config !== null) {
        setConfig(loaded.config)
        setApi(new ForgeMobileApi({ baseUrl: loaded.config.serverUrl, token: loaded.config.token }))
      }
    })()
  }, [])

  const handleConnected = (newConfig: ConnectionConfig): void => {
    void saveConnection(storage, newConfig)
    setConfig(newConfig)
    setApi(new ForgeMobileApi({ baseUrl: newConfig.serverUrl, token: newConfig.token }))
    setScreen({ name: 'sessions' })
  }

  const disconnect = (): void => {
    void clearConnection(storage)
    setConfig(null)
    setApi(null)
    setScreen({ name: 'sessions' })
  }

  if (restoring) {
    return (
      <View style={styles.root}>
        <Text style={styles.muted}>…</Text>
      </View>
    )
  }
  if (config === null || api === null) {
    return <ConnectScreen existing={null} onConnected={handleConnected} />
  }
  return (
    <View style={styles.root}>
      <Text style={styles.statusBar} onPress={disconnect}>
        {config.name ?? config.serverUrl} — tap to disconnect
      </Text>
      {screen.name === 'sessions' ? (
        <SessionsScreen
          api={api}
          onOpenSession={(sessionId) => setScreen({ name: 'session', sessionId })}
        />
      ) : (
        <SessionScreen
          api={api}
          sessionId={screen.sessionId}
          onSent={(sentSessionId) => setScreen({ name: 'session', sessionId: sentSessionId })}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 40 },
  muted: { color: '#8b949e' },
  statusBar: { color: '#8b949e', fontSize: 12, padding: 12 },
})
