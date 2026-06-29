import { pool } from '../db/index.js';

async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      teacher_id UUID NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      session_date TIMESTAMP NOT NULL,
      topic TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS attendance_sessions_batch_id_idx ON attendance_sessions(batch_id);
    CREATE INDEX IF NOT EXISTS attendance_sessions_session_date_idx ON attendance_sessions(session_date);

    CREATE TABLE IF NOT EXISTS attendance_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late')),
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS attendance_records_session_id_idx ON attendance_records(session_id);
    CREATE INDEX IF NOT EXISTS attendance_records_student_id_idx ON attendance_records(student_id);
  `);
}

export async function connectDatabase() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL connected successfully');
    await runMigrations();
  } catch (error) {
    console.warn('⚠️ Database unavailable, continuing in degraded mode:', error instanceof Error ? error.message : error);
  }
}

export async function disconnectDatabase() {
  await pool.end();
}
