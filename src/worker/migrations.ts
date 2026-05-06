import { migrate, db } from "flingit";

migrate("003_sync_logs", async () => {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY,
      ran_at TEXT DEFAULT (datetime('now')),
      status TEXT NOT NULL,
      students INTEGER,
      teachers INTEGER,
      classes INTEGER,
      enrollments INTEGER,
      teacher_assignments INTEGER,
      error_message TEXT,
      duration_ms INTEGER
    )
  `).run();
});

migrate("002_classes_teacher_fields", async () => {
  // Add teacher info columns to classes (safe if already exists)
  try {
    await db.prepare(`ALTER TABLE classes ADD COLUMN primary_teacher_vc_id TEXT`).run();
  } catch { /* column already exists */ }
  try {
    await db.prepare(`ALTER TABLE classes ADD COLUMN primary_teacher_name TEXT`).run();
  } catch { /* column already exists */ }
});

migrate("001_core_schema", async () => {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      picture TEXT,
      role TEXT NOT NULL DEFAULT 'student',
      veracross_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      veracross_id TEXT UNIQUE,
      name TEXT NOT NULL,
      subject TEXT,
      grade_level TEXT,
      school_year TEXT,
      term TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      UNIQUE(student_id, class_id),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS teacher_classes (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      UNIQUE(teacher_id, class_id),
      FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS survey_windows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      opens_at TEXT NOT NULL,
      closes_at TEXT NOT NULL,
      target_all INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS survey_window_classes (
      survey_window_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      PRIMARY KEY (survey_window_id, class_id),
      FOREIGN KEY (survey_window_id) REFERENCES survey_windows(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS engagement_responses (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      survey_window_id TEXT NOT NULL,
      challenge INTEGER NOT NULL,
      love INTEGER NOT NULL,
      submitted_at TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, class_id, survey_window_id),
      FOREIGN KEY (student_id) REFERENCES users(id),
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (survey_window_id) REFERENCES survey_windows(id)
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS mattering_responses (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      survey_window_id TEXT NOT NULL,
      connection INTEGER NOT NULL,
      contribution INTEGER NOT NULL,
      submitted_at TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, class_id, survey_window_id),
      FOREIGN KEY (student_id) REFERENCES users(id),
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (survey_window_id) REFERENCES survey_windows(id)
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS dimension_responses (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      survey_window_id TEXT NOT NULL,
      behavioral_effort INTEGER,
      behavioral_focus INTEGER,
      behavioral_respect INTEGER,
      cognitive_clarity INTEGER,
      cognitive_expectations INTEGER,
      cognitive_feedback INTEGER,
      cognitive_challenge INTEGER,
      emotional_known INTEGER,
      emotional_cared INTEGER,
      emotional_motivated INTEGER,
      emotional_enjoyment INTEGER,
      instructional_activities INTEGER,
      instructional_collaboration INTEGER,
      instructional_assignments INTEGER,
      behavioral_comments TEXT,
      cognitive_comments TEXT,
      emotional_comments TEXT,
      instructional_comments TEXT,
      submitted_at TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, class_id, survey_window_id),
      FOREIGN KEY (student_id) REFERENCES users(id),
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (survey_window_id) REFERENCES survey_windows(id)
    )
  `).run();
});
