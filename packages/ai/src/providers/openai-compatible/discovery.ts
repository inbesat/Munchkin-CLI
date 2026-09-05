export interface DiscoveredModel {
  readonly id: string
  readonly ownedBy: string
}

interface OpenAIModelsResponse {
  data: Array<{
    id: string
    object: string
    created?: number
    owned_by?: string
  }>
}

export async function discoverModels(
  baseUrl: string,
  apiKey = '',
): Promise<readonly DiscoveredModel[]> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    const resp = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers,
    })

    if (!resp.ok) {
      return []
    }

    const data = (await resp.json()) as OpenAIModelsResponse

    if (!Array.isArray(data.data)) {
      return []
    }

    return data.data.map((m) => ({
      id: m.id,
      ownedBy: m.owned_by ?? 'unknown',
    }))
  } catch {
    return []
  }
}
