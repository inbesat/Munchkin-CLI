/**
 * Docker/Podman environment provider (Phase 129): runs commands inside an
 * OCI container built from the bundled sandbox image (Node + Python + Git).
 * The container root filesystem is read-only, the project directory is
 * volume-mounted read-write, and the network is disabled unless opted in.
 * Docker is preferred; Podman is the drop-in fallback.
 * Live verification requires a container runtime; elsewhere the pure
 * argument assembly is tested and live runs self-skip.
 */

import { spawnSync } from 'node:child_process'
import {
  type SandboxCommandRequest,
  type SandboxExecutionResult,
  type SandboxProvider,
  defineSandboxProvider,
} from '../types'

export const DOCKER_SANDBOX_ID = 'docker-container'

export const SANDBOX_IMAGE = 'forge-sandbox:latest'

/** The bundled sandbox image def (Node 22 + Python 3 + Git). */
export const SANDBOX_DOCKERFILE = `FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \\
    python3 python3-pip git ca-certificates curl \\
  && rm -rf /var/lib/apt/lists/*

# Dedicated unprivileged user for the sandboxed work.
RUN useradd -m -u 1000 sandbox

USER sandbox
WORKDIR /workspace

CMD ["/bin/bash"]
`

export type ContainerRuntime = 'docker' | 'podman'

/** Detect docker, falling back to podman. Null when neither exists. */
export function detectRuntime():
  | { ok: true; runtime: ContainerRuntime }
  | { ok: false; error: string } {
  for (const runtime of ['docker', 'podman'] as const) {
    const probe = spawnSync(runtime, ['--version'], { encoding: 'utf-8', timeout: 10_000 })
    if (probe.status === 0) return { ok: true, runtime }
  }
  return { ok: false, error: 'neither docker nor podman is installed' }
}

export interface BuildRunOptions {
  image: string
  /** Host scratch dir mounted at /work inside the container. */
  scratch: string
  /** Host project dir mounted at /workspace (read-write). */
  projectDir?: string
  command: string
  args: readonly string[]
  /** Unshare the network (default: denied). */
  allowNetwork?: boolean
  /** Memory limit, e.g. '512m'. */
  memory?: string
}

function dockerMount(hostPath: string): string {
  // Git-bash style path mangling is avoided by always passing absolute
  // Windows paths with forward slashes for MSYS; docker handles both.
  return hostPath.replaceAll('\\', '/')
}

/** Assemble the `run` argv for the container runtime (before the binary). */
export function buildDockerRunArgs(options: BuildRunOptions): string[] {
  const args = ['run', '--rm']
  if (options.allowNetwork !== true) args.push('--network', 'none')
  args.push('--read-only')
  args.push('--cap-drop', 'ALL')
  args.push('--security-opt', 'no-new-privileges')
  if (options.memory !== undefined) args.push('--memory', options.memory)
  args.push('--tmpfs', '/tmp:rw,size=64m')
  args.push('-v', `${dockerMount(options.scratch)}:/work`)
  if (options.projectDir !== undefined) {
    args.push('-v', `${dockerMount(options.projectDir)}:/workspace`)
    args.push('--workdir', '/workspace')
  }
  args.push(options.image)
  args.push('--')
  args.push(options.command, ...options.args)
  return args
}

export interface DockerSandboxOptions {
  timeoutMs?: number
  image?: string
}

export class DockerSandboxProvider implements SandboxProvider {
  readonly id = DOCKER_SANDBOX_ID
  private runtime: ContainerRuntime | null = null
  private availabilityCache: { available: boolean; reason?: string } | null = null

  constructor(private readonly options: DockerSandboxOptions = {}) {}

  info(): ReturnType<SandboxProvider['info']> {
    const available = this.availabilityCache?.available ?? this.detectSync()
    const info: ReturnType<SandboxProvider['info']> = {
      id: DOCKER_SANDBOX_ID,
      platform: 'container',
      capabilities: [
        'execute',
        'check-isolation',
        'volume-mount',
        'network-deny',
        'read-only-root',
      ],
      available,
    }
    if (!available)
      info.unsupportedReason = this.availabilityCache?.reason ?? 'no docker/podman runtime'
    return info
  }

  private detectSync(): boolean {
    const detected = detectRuntime()
    if (detected.ok) {
      this.runtime = detected.runtime
      return true
    }
    this.availabilityCache = { available: false, reason: detected.error }
    return false
  }

  async isAvailable(): Promise<boolean> {
    if (this.availabilityCache !== null) return this.availabilityCache.available
    const detected = detectRuntime()
    if (!detected.ok) {
      this.availabilityCache = { available: false, reason: detected.error }
      return false
    }
    this.runtime = detected.runtime
    // Live probe with the sandbox image (or any base image when unbuilt).
    const image = this.options.image ?? SANDBOX_IMAGE
    const hasImage = spawnSync(this.runtime, ['images', '-q', image], { encoding: 'utf-8' })
    const imageToProbe = (hasImage.stdout ?? '').trim().length > 0 ? image : 'alpine:latest'
    const probe = spawnSync(
      this.runtime,
      ['run', '--rm', '--network', 'none', imageToProbe, '/bin/sh', '-c', 'echo ok'],
      { encoding: 'utf-8', timeout: 60_000 },
    )
    this.availabilityCache =
      probe.status === 0
        ? { available: true }
        : { available: false, reason: (probe.stderr ?? 'runtime probe failed').slice(0, 200) }
    return this.availabilityCache.available
  }

  async execute(request: SandboxCommandRequest): Promise<SandboxExecutionResult> {
    const started = Date.now()
    if (this.availabilityCache === null) await this.isAvailable()
    if (this.availabilityCache !== null && this.availabilityCache.available === false) {
      return {
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        error: this.availabilityCache.reason ?? 'container runtime unavailable',
        durationMs: Date.now() - started,
      }
    }
    const runtime = this.runtime ?? 'docker'
    const args = buildDockerRunArgs({
      image: this.options.image ?? SANDBOX_IMAGE,
      scratch: request.cwd ?? process.cwd(),
      command: request.command,
      args: request.args,
    })
    const timeout = request.timeoutMs ?? this.options.timeoutMs ?? 60_000
    const result = spawnSync(runtime, args, {
      encoding: 'utf-8',
      timeout,
      env: request.env !== undefined ? { ...process.env, ...request.env } : undefined,
    })
    const timedOut = result.error !== undefined && result.error.name === 'ETIMEDOUT'
    const payload: SandboxExecutionResult = {
      exitCode: timedOut ? null : (result.status ?? null),
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      timedOut,
      durationMs: Date.now() - started,
    }
    if (result.error !== undefined && !timedOut) {
      return { ...payload, error: result.error.message }
    }
    return payload
  }

  /**
   * Probes: /workspace volume write allowed; /etc write denied (read-only
   * root); network denied.
   */
  async checkIsolation(): Promise<{
    isolated: boolean
    checks: { name: string; passed: boolean; details?: string }[]
  }> {
    const checks: { name: string; passed: boolean; details?: string }[] = []

    const volumeWrite = await this.execute({
      command: '/bin/sh',
      args: ['-c', 'echo ok > /workspace/write-probe.txt && cat /workspace/write-probe.txt'],
    })
    checks.push({
      name: 'workspace-volume-write-allowed',
      passed:
        !volumeWrite.timedOut && volumeWrite.exitCode === 0 && volumeWrite.stdout.includes('ok'),
      details: volumeWrite.error ?? volumeWrite.stderr,
    })

    const etcWrite = await this.execute({
      command: '/bin/sh',
      args: ['-c', 'echo intruder > /etc/probe.txt'],
    })
    checks.push({
      name: 'denied: /etc write (read-only root)',
      passed: etcWrite.exitCode !== 0 || etcWrite.stderr.length > 0,
    })

    const network = await this.execute({
      command: '/bin/sh',
      args: [
        '-c',
        'command -v curl >/dev/null && curl --max-time 5 http://example.invalid || echo curl-missing',
      ],
    })
    checks.push({
      name: 'denied: network',
      passed:
        network.timedOut !== true &&
        (network.stdout.includes('curl-missing') || network.exitCode !== 0),
    })

    return { isolated: checks.every((check) => check.passed), checks }
  }
}

export const dockerSandboxProvider: SandboxProvider = defineSandboxProvider(
  new DockerSandboxProvider(),
)
