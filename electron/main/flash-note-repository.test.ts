import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FlashNoteRepository } from './flash-note-repository'

/** Electron 打包用的 better-sqlite3 与本地 `node` 主版本不一致时会加载失败，此时跳过本文件测试。 */
function nativeSqliteUsable(): boolean {
  try {
    const d = new Database(':memory:')
    d.close()
    return true
  } catch {
    return false
  }
}

const runRepoTests = nativeSqliteUsable() ? describe : describe.skip

runRepoTests('FlashNoteRepository', () => {
  let dir: string
  let repo: FlashNoteRepository | undefined

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'voicekey-flash-test-'))
    const dbPath = path.join(dir, 'flash.db')
    repo = new FlashNoteRepository(dbPath)
  })

  afterEach(() => {
    try {
      repo?.close()
    } catch {
      /* ignore */
    }
    repo = undefined
    rmSync(dir, { recursive: true, force: true })
  })

  it('getSessionWithChunksById returns null when missing', () => {
    expect(repo).toBeDefined()
    if (!repo) return
    expect(repo.getSessionWithChunksById('no-such-session')).toBeNull()
  })

  it('getSessionWithChunksById returns chunks ordered by chunkIndex', () => {
    expect(repo).toBeDefined()
    if (!repo) return
    const sessionId = 'sess-1'
    const t0 = new Date().toISOString()
    repo.createSession(sessionId, t0, 'completed')

    repo.createChunk({
      chunkId: 'c-high',
      sessionId,
      chunkIndex: 2,
      startedAt: t0,
      endedAt: t0,
      audioPath: null,
      remoteUrl: null,
      status: 'success',
    })
    repo.createChunk({
      chunkId: 'c-low',
      sessionId,
      chunkIndex: 0,
      startedAt: t0,
      endedAt: t0,
      audioPath: null,
      remoteUrl: null,
      status: 'success',
    })
    repo.createChunk({
      chunkId: 'c-mid',
      sessionId,
      chunkIndex: 1,
      startedAt: t0,
      endedAt: t0,
      audioPath: null,
      remoteUrl: null,
      status: 'pending',
    })

    const row = repo.getSessionWithChunksById(sessionId)
    expect(row).not.toBeNull()
    if (!row) return
    expect(row.sessionId).toBe(sessionId)
    expect(row.chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2])
    expect(row.chunks.map((c) => c.chunkId)).toEqual(['c-low', 'c-mid', 'c-high'])
  })
})
