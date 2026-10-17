import { useState } from 'react'
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, TextInput } from 'react-native'
import type { ForgeMobileApi } from '../api'

interface SessionScreenProps {
  api: ForgeMobileApi
  sessionId: string | undefined
  onSent: (sessionId: string, response: string) => void
}

/** Prompt runner: sends a prompt into the session and shows the response. */
export function SessionScreen({ api, sessionId, onSent }: SessionScreenProps) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastResponse, setLastResponse] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  const send = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    const result = await api.sendPrompt(prompt, { sessionId })
    setBusy(false)
    if (result.ok) {
      setPrompt('')
      setLastResponse(result.value.response)
      onSent(result.value.sessionId, result.value.response)
    } else {
      setError(result.error)
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{sessionId === undefined ? 'new session' : sessionId}</Text>
      <TextInput
        style={styles.input}
        placeholder="prompt"
        value={prompt}
        onChangeText={setPrompt}
        multiline
      />
      {busy ? <ActivityIndicator /> : <Button title="Send" onPress={() => void send()} />}
      {error !== undefined && <Text style={styles.error}>{error}</Text>}
      {lastResponse !== undefined && <Text style={styles.response}>{lastResponse}</Text>}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 14, color: '#8b949e' },
  input: {
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  error: { color: '#f85149' },
  response: {
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    padding: 12,
    color: '#e6edf3',
  },
})
