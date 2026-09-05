import { SessionLog, createEvent } from '../events'
import { type ResumedSession, resumeSession } from './resume'

export interface ForkOptions {
  baseDir: string
  parentSessionId: string
  newSessionId?: string
  forkAfterEventIndex?: number
  forkAfterTimestamp?: number
  newModel?: string
  newTitle?: string
}

export interface ForkResult {
  parentSession: ResumedSession
  childSessionId: string
  eventsCopied: number
  forkPoint: number
}

export async function forkSession(options: ForkOptions): Promise<ForkResult> {
  const parentSession = await resumeSession({
    baseDir: options.baseDir,
    sessionId: options.parentSessionId,
  })

  if (!parentSession) {
    throw new Error(`Parent session '${options.parentSessionId}' not found`)
  }

  const parentLog = new SessionLog(options.baseDir, options.parentSessionId)
  const childSessionId = options.newSessionId ?? `${options.parentSessionId}-fork-${Date.now()}`
  const childLog = new SessionLog(options.baseDir, childSessionId)

  let forkPoint = -1
  let eventsCopied = 0
  let eventIndex = 0

  for await (const event of parentLog.iterate()) {
    if (options.forkAfterEventIndex !== undefined && eventIndex > options.forkAfterEventIndex) {
      break
    }
    if (options.forkAfterTimestamp !== undefined && event.timestamp > options.forkAfterTimestamp) {
      break
    }

    await childLog.append(event)
    eventsCopied++
    forkPoint = eventIndex
    eventIndex++
  }

  if (eventsCopied === 0) {
    throw new Error('No events to fork from')
  }

  const model = options.newModel ?? parentSession.model
  await childLog.append(
    createEvent('session.created', childSessionId, {
      model,
      cwd: parentSession.cwd,
      title: options.newTitle ?? `Fork of ${parentSession.title ?? parentSession.sessionId}`,
    }),
  )
  eventsCopied++

  return {
    parentSession,
    childSessionId,
    eventsCopied,
    forkPoint,
  }
}

export async function forkSessionAtMessage(
  baseDir: string,
  parentSessionId: string,
  messageIndex: number,
  options?: { newSessionId?: string; newModel?: string; newTitle?: string },
): Promise<ForkResult> {
  const parentLog = new SessionLog(baseDir, parentSessionId)
  let eventIndex = 0
  let messageCount = 0
  let forkAfterEventIndex = -1

  for await (const event of parentLog.iterate()) {
    if (event.type === 'session.message') {
      if (messageCount === messageIndex) {
        forkAfterEventIndex = eventIndex
        break
      }
      messageCount++
    }
    eventIndex++
  }

  if (forkAfterEventIndex === -1) {
    throw new Error(`Message at index ${messageIndex} not found`)
  }

  return forkSession({
    baseDir,
    parentSessionId,
    forkAfterEventIndex,
    ...options,
  })
}
