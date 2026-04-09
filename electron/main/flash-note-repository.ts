import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type {
  FlashChunk,
  FlashChunkStatus,
  FlashSession,
  FlashSessionStatus,
  FlashSessionWithChunks,
} from '../shared/types'

interface FlashSessionRow extends Omit<FlashSession, 'endedAt' | 'summary'> {
  endedAt: string | null
  summary: string | null
}

interface FlashChunkRow extends Omit<
  FlashChunk,
  'audioPath' | 'remoteUrl' | 'transcript' | 'errorMessage'
> {
  audioPath: string | null
  remoteUrl: string | null
  transcript: string | null
  errorMessage: string | null
}

export class FlashNoteRepository {
  private readonly db: Database.Database

  constructor(dbFilePath: string) {
    const dir = path.dirname(dbFilePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.db = new Database(dbFilePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.init()
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS flash_sessions (
        session_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL,
        summary TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS flash_chunks (
        chunk_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        audio_path TEXT,
        remote_url TEXT,
        status TEXT NOT NULL,
        transcript TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES flash_sessions(session_id)
      );

      CREATE INDEX IF NOT EXISTS idx_flash_sessions_started_at
        ON flash_sessions(started_at DESC);

      CREATE INDEX IF NOT EXISTS idx_flash_chunks_session_id
        ON flash_chunks(session_id);

      CREATE INDEX IF NOT EXISTS idx_flash_chunks_session_index
        ON flash_chunks(session_id, chunk_index);
    `)
  }

  createSession(sessionId: string, startedAt: string, status: FlashSessionStatus): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO flash_sessions
        (session_id, started_at, ended_at, status, summary, created_at, updated_at)
        VALUES (@sessionId, @startedAt, NULL, @status, NULL, @now, @now)`,
      )
      .run({ sessionId, startedAt, status, now })
  }

  updateSessionStatus(
    sessionId: string,
    status: FlashSessionStatus,
    endedAt: string | null = null,
  ): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE flash_sessions
         SET status = @status, ended_at = COALESCE(@endedAt, ended_at), updated_at = @now
         WHERE session_id = @sessionId`,
      )
      .run({ sessionId, status, endedAt, now })
  }

  updateSessionSummary(sessionId: string, summary: string): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE flash_sessions
         SET summary = @summary, updated_at = @now
         WHERE session_id = @sessionId`,
      )
      .run({ sessionId, summary, now })
  }

  createChunk(params: {
    chunkId: string
    sessionId: string
    chunkIndex: number
    startedAt: string
    endedAt: string
    audioPath: string | null
    remoteUrl: string | null
    status: FlashChunkStatus
  }): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO flash_chunks
        (chunk_id, session_id, chunk_index, started_at, ended_at, audio_path, remote_url, status, transcript, error_message, created_at, updated_at)
        VALUES (@chunkId, @sessionId, @chunkIndex, @startedAt, @endedAt, @audioPath, @remoteUrl, @status, NULL, NULL, @now, @now)`,
      )
      .run({ ...params, now })
  }

  updateChunk(params: {
    chunkId: string
    status: FlashChunkStatus
    remoteUrl?: string | null
    transcript?: string | null
    errorMessage?: string | null
    audioPath?: string | null
  }): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE flash_chunks
         SET status = @status,
             remote_url = COALESCE(@remoteUrl, remote_url),
             transcript = COALESCE(@transcript, transcript),
             error_message = @errorMessage,
             audio_path = COALESCE(@audioPath, audio_path),
             updated_at = @now
         WHERE chunk_id = @chunkId`,
      )
      .run({
        ...params,
        remoteUrl: params.remoteUrl ?? null,
        transcript: params.transcript ?? null,
        errorMessage: params.errorMessage ?? null,
        audioPath: params.audioPath ?? null,
        now,
      })
  }

  getChunk(chunkId: string): FlashChunk | null {
    const row = this.db
      .prepare(
        `SELECT
          chunk_id AS chunkId,
          session_id AS sessionId,
          chunk_index AS chunkIndex,
          started_at AS startedAt,
          ended_at AS endedAt,
          audio_path AS audioPath,
          remote_url AS remoteUrl,
          status AS status,
          transcript AS transcript,
          error_message AS errorMessage,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM flash_chunks
        WHERE chunk_id = ?`,
      )
      .get(chunkId) as FlashChunkRow | undefined

    return row ?? null
  }

  getActiveSession(): FlashSessionWithChunks | null {
    const row = this.db
      .prepare(
        `SELECT
          session_id AS sessionId,
          started_at AS startedAt,
          ended_at AS endedAt,
          status AS status,
          summary AS summary,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM flash_sessions
        WHERE status IN ('recording', 'flushing')
        ORDER BY started_at DESC
        LIMIT 1`,
      )
      .get() as FlashSessionRow | undefined

    if (!row) {
      return null
    }

    const chunks = this.getChunksBySessionId(row.sessionId)
    return { ...row, chunks }
  }

  getSessionsWithChunks(limit = 100): FlashSessionWithChunks[] {
    const sessions = this.db
      .prepare(
        `SELECT
          session_id AS sessionId,
          started_at AS startedAt,
          ended_at AS endedAt,
          status AS status,
          summary AS summary,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM flash_sessions
        ORDER BY started_at DESC
        LIMIT ?`,
      )
      .all(limit) as FlashSessionRow[]

    return sessions.map((session) => ({
      ...session,
      chunks: this.getChunksBySessionId(session.sessionId),
    }))
  }

  /** 单条会话 + 分片（按 chunk_index 升序），不存在则 null */
  getSessionWithChunksById(sessionId: string): FlashSessionWithChunks | null {
    const row = this.db
      .prepare(
        `SELECT
          session_id AS sessionId,
          started_at AS startedAt,
          ended_at AS endedAt,
          status AS status,
          summary AS summary,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM flash_sessions
        WHERE session_id = ?`,
      )
      .get(sessionId) as FlashSessionRow | undefined

    if (!row) return null
    return { ...row, chunks: this.getChunksBySessionId(sessionId) }
  }

  private getChunksBySessionId(sessionId: string): FlashChunk[] {
    return this.db
      .prepare(
        `SELECT
          chunk_id AS chunkId,
          session_id AS sessionId,
          chunk_index AS chunkIndex,
          started_at AS startedAt,
          ended_at AS endedAt,
          audio_path AS audioPath,
          remote_url AS remoteUrl,
          status AS status,
          transcript AS transcript,
          error_message AS errorMessage,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM flash_chunks
        WHERE session_id = ?
        ORDER BY chunk_index ASC`,
      )
      .all(sessionId) as FlashChunk[]
  }

  close(): void {
    this.db.close()
  }
}
