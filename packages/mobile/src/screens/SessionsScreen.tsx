import type { Session } from '@forge/sdk'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native'
import type { ForgeMobileApi } from '../api'

interface SessionsScreenProps {
  api: ForgeMobileApi
  onOpenSession: (sessionId: string) => void
}

/** Session list: latest activity first, tap to open the runner. */
export function SessionsScreen({ api, onOpenSession }: SessionsScreenProps) {
  const [sessions, setSessions] = useState<Session[] | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  const load = useCallback(async (): Promise<void> => {
    const result = await api.listSessions()
    if (result.ok) {
      const sorted = [...result.value].sort((a, b) => b.updatedAt - a.updatedAt)
      setSessions(sorted)
      setError(undefined)
    } else {
      setError(result.error)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  if (error !== undefined) {
    return (
      <View style={styles.root}>
        <Text style={styles.error}>{error}</Text>
        <Text onPress={() => void load()} style={styles.retry}>
          retry
        </Text>
      </View>
    )
  }
  if (sessions === undefined) {
    return (
      <View style={styles.root}>
        <ActivityIndicator />
      </View>
    )
  }
  return (
    <View style={styles.root}>
      <Text style={styles.title}>sessions</Text>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Text style={styles.row} onPress={() => onOpenSession(item.id)} numberOfLines={2}>
            {item.title ?? item.id} · {item.status} · {item.eventCount} events
          </Text>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>no sessions yet — send the first prompt below</Text>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#30363d',
  },
  empty: { color: '#8b949e', marginTop: 24 },
  error: { color: '#f85149' },
  retry: { color: '#79c0ff', marginTop: 12 },
})
