import { app, db } from "flingit";
import "./migrations";
import {
  getSessionUser,
  sessionCookieHeader,
  clearSessionCookieHeader,
  getRedirectUri,
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  getAdminEmails,
} from "./auth";
import { syncVeracross } from "./veracross";

// ─── Auth ────────────────────────────────────────────────────────────────────

app.get("/api/auth/google", (c) => {
  try {
    const redirectUri = getRedirectUri(c.req.url);
    const url = buildGoogleAuthUrl(redirectUri);
    return c.redirect(url);
  } catch {
    return c.json({ error: "GOOGLE_CLIENT_ID secret is not configured" }, 500);
  }
});

app.get("/api/auth/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.redirect("/?error=no_code");

  try {
    const redirectUri = getRedirectUri(c.req.url);
    const googleUser = await exchangeGoogleCode(code, redirectUri);

    // Determine role: admin emails take priority, then existing DB role, then default student
    const adminEmails = getAdminEmails();
    const isAdminEmail = adminEmails.includes(googleUser.email.toLowerCase());

    let user = await db
      .prepare(`SELECT id, role FROM users WHERE google_id = ?1 OR email = ?2`)
      .bind(googleUser.sub, googleUser.email.toLowerCase())
      .first<{ id: string; role: string }>();

    if (!user) {
      const newId = crypto.randomUUID();
      const role = isAdminEmail ? "admin" : "student";
      await db
        .prepare(
          `INSERT INTO users (id, google_id, email, name, picture, role)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
        )
        .bind(newId, googleUser.sub, googleUser.email.toLowerCase(), googleUser.name, googleUser.picture, role)
        .run();
      user = { id: newId, role };
    } else {
      // Update google_id/name/picture; promote to admin if email matches
      const newRole = isAdminEmail ? "admin" : user.role;
      await db
        .prepare(
          `UPDATE users SET google_id = ?1, name = ?2, picture = ?3, role = ?4, updated_at = datetime('now')
           WHERE id = ?5`
        )
        .bind(googleUser.sub, googleUser.name, googleUser.picture, newRole, user.id)
        .run();
      user = { ...user, role: newRole };
    }

    // Create session
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
    await db
      .prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?1, ?2, ?3)`)
      .bind(sessionId, user.id, expiresAt)
      .run();

    const isSecure = c.req.url.startsWith("https");
    c.header("Set-Cookie", sessionCookieHeader(sessionId, isSecure));
    return c.redirect("/");
  } catch (err) {
    console.error("Auth callback error:", err);
    return c.redirect("/?error=auth_failed");
  }
});

app.get("/api/auth/me", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json(user);
});

app.post("/api/auth/logout", async (c) => {
  const { getCookie } = await import("hono/cookie");
  const sessionId = getCookie(c, "session");
  if (sessionId) {
    await db.prepare(`DELETE FROM sessions WHERE id = ?1`).bind(sessionId).run();
  }
  c.header("Set-Cookie", clearSessionCookieHeader());
  return c.json({ ok: true });
});

// ─── Student ─────────────────────────────────────────────────────────────────

app.get("/api/student/surveys", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const classes = await db
    .prepare(
      `SELECT c.id, c.name, c.subject, c.grade_level
       FROM enrollments e JOIN classes c ON c.id = e.class_id
       WHERE e.student_id = ?1 ORDER BY c.name`
    )
    .bind(user.id)
    .all<{ id: string; name: string; subject: string | null; grade_level: string | null }>();

  const windows = await db
    .prepare(
      `SELECT id, name, type, opens_at, closes_at FROM survey_windows
       WHERE opens_at <= datetime('now') AND closes_at >= datetime('now')
       ORDER BY closes_at`
    )
    .all<{ id: string; name: string; type: string; opens_at: string; closes_at: string }>();

  // For each window × class, check if student already responded
  const result = [];
  for (const win of windows.results) {
    const entries = [];
    for (const cls of classes.results) {
      // Check if window targets this class
      const applies =
        (await db
          .prepare(
            `SELECT 1 FROM survey_windows WHERE id = ?1 AND target_all = 1`
          )
          .bind(win.id)
          .first()) !== null ||
        (await db
          .prepare(
            `SELECT 1 FROM survey_window_classes WHERE survey_window_id = ?1 AND class_id = ?2`
          )
          .bind(win.id, cls.id)
          .first()) !== null;

      if (!applies) continue;

      const responseTable =
        win.type === "engagement_index"
          ? "engagement_responses"
          : win.type === "mattering_index"
          ? "mattering_responses"
          : "dimension_responses";

      const completed =
        (await db
          .prepare(
            `SELECT 1 FROM ${responseTable} WHERE student_id = ?1 AND class_id = ?2 AND survey_window_id = ?3`
          )
          .bind(user.id, cls.id, win.id)
          .first()) !== null;

      entries.push({ ...cls, completed });
    }
    if (entries.length > 0) result.push({ window: win, classes: entries });
  }

  return c.json(result);
});

app.post("/api/student/respond/engagement", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { surveyWindowId, classId, challenge, love } = await c.req.json<{
    surveyWindowId: string;
    classId: string;
    challenge: number;
    love: number;
  }>();

  if (challenge < 1 || challenge > 10 || love < 1 || love > 10)
    return c.json({ error: "Values must be 1–10" }, 400);

  await db
    .prepare(
      `INSERT INTO engagement_responses (id, student_id, class_id, survey_window_id, challenge, love)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(student_id, class_id, survey_window_id) DO UPDATE SET
         challenge = excluded.challenge, love = excluded.love, submitted_at = datetime('now')`
    )
    .bind(crypto.randomUUID(), user.id, classId, surveyWindowId, challenge, love)
    .run();

  return c.json({ ok: true });
});

app.post("/api/student/respond/mattering", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { surveyWindowId, classId, connection, contribution } = await c.req.json<{
    surveyWindowId: string;
    classId: string;
    connection: number;
    contribution: number;
  }>();

  if (connection < 1 || connection > 5 || contribution < 1 || contribution > 5)
    return c.json({ error: "Values must be 1–5" }, 400);

  await db
    .prepare(
      `INSERT INTO mattering_responses (id, student_id, class_id, survey_window_id, connection, contribution)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(student_id, class_id, survey_window_id) DO UPDATE SET
         connection = excluded.connection, contribution = excluded.contribution, submitted_at = datetime('now')`
    )
    .bind(crypto.randomUUID(), user.id, classId, surveyWindowId, connection, contribution)
    .run();

  return c.json({ ok: true });
});

app.post("/api/student/respond/dimensions", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json<{
    surveyWindowId: string;
    classId: string;
    behavioral_effort: number;
    behavioral_focus: number;
    behavioral_respect: number;
    cognitive_clarity: number;
    cognitive_expectations: number;
    cognitive_feedback: number;
    cognitive_challenge: number;
    emotional_known: number;
    emotional_cared: number;
    emotional_motivated: number;
    emotional_enjoyment: number;
    instructional_activities: number;
    instructional_collaboration: number;
    instructional_assignments: number;
    behavioral_comments: string;
    cognitive_comments: string;
    emotional_comments: string;
    instructional_comments: string;
  }>();

  await db
    .prepare(
      `INSERT INTO dimension_responses (
         id, student_id, class_id, survey_window_id,
         behavioral_effort, behavioral_focus, behavioral_respect,
         cognitive_clarity, cognitive_expectations, cognitive_feedback, cognitive_challenge,
         emotional_known, emotional_cared, emotional_motivated, emotional_enjoyment,
         instructional_activities, instructional_collaboration, instructional_assignments,
         behavioral_comments, cognitive_comments, emotional_comments, instructional_comments
       ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)
       ON CONFLICT(student_id, class_id, survey_window_id) DO UPDATE SET
         behavioral_effort=excluded.behavioral_effort, behavioral_focus=excluded.behavioral_focus,
         behavioral_respect=excluded.behavioral_respect, cognitive_clarity=excluded.cognitive_clarity,
         cognitive_expectations=excluded.cognitive_expectations, cognitive_feedback=excluded.cognitive_feedback,
         cognitive_challenge=excluded.cognitive_challenge, emotional_known=excluded.emotional_known,
         emotional_cared=excluded.emotional_cared, emotional_motivated=excluded.emotional_motivated,
         emotional_enjoyment=excluded.emotional_enjoyment, instructional_activities=excluded.instructional_activities,
         instructional_collaboration=excluded.instructional_collaboration,
         instructional_assignments=excluded.instructional_assignments,
         behavioral_comments=excluded.behavioral_comments, cognitive_comments=excluded.cognitive_comments,
         emotional_comments=excluded.emotional_comments, instructional_comments=excluded.instructional_comments,
         submitted_at=datetime('now')`
    )
    .bind(
      crypto.randomUUID(), user.id, body.classId, body.surveyWindowId,
      body.behavioral_effort, body.behavioral_focus, body.behavioral_respect,
      body.cognitive_clarity, body.cognitive_expectations, body.cognitive_feedback, body.cognitive_challenge,
      body.emotional_known, body.emotional_cared, body.emotional_motivated, body.emotional_enjoyment,
      body.instructional_activities, body.instructional_collaboration, body.instructional_assignments,
      body.behavioral_comments || "", body.cognitive_comments || "",
      body.emotional_comments || "", body.instructional_comments || ""
    )
    .run();

  return c.json({ ok: true });
});

// ─── Teacher ─────────────────────────────────────────────────────────────────

app.get("/api/teacher/classes", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "teacher" && user.role !== "admin")
    return c.json({ error: "Forbidden" }, 403);

  const classes = await db
    .prepare(
      `SELECT c.id, c.name, c.subject, c.grade_level, c.school_year, c.term
       FROM teacher_classes tc JOIN classes c ON c.id = tc.class_id
       WHERE tc.teacher_id = ?1 ORDER BY c.name`
    )
    .bind(user.id)
    .all<{ id: string; name: string; subject: string | null; grade_level: string | null; school_year: string | null; term: string | null }>();

  // For each class, get active windows and response counts
  const result = [];
  for (const cls of classes.results) {
    const studentCount = await db
      .prepare(`SELECT COUNT(*) as cnt FROM enrollments WHERE class_id = ?1`)
      .bind(cls.id)
      .first<{ cnt: number }>();

    const windows = await db
      .prepare(
        `SELECT sw.id, sw.name, sw.type, sw.opens_at, sw.closes_at
         FROM survey_windows sw
         WHERE (sw.target_all = 1 OR EXISTS (
           SELECT 1 FROM survey_window_classes swc WHERE swc.survey_window_id = sw.id AND swc.class_id = ?1
         ))
         ORDER BY sw.closes_at DESC LIMIT 10`
      )
      .bind(cls.id)
      .all<{ id: string; name: string; type: string; opens_at: string; closes_at: string }>();

    result.push({
      ...cls,
      studentCount: studentCount?.cnt ?? 0,
      windows: windows.results,
    });
  }

  return c.json(result);
});

app.get("/api/teacher/classes/:classId/results/:windowId", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { classId, windowId } = c.req.param();

  // Verify teacher owns this class (admins bypass)
  if (user.role !== "admin") {
    const owns = await db
      .prepare(`SELECT 1 FROM teacher_classes WHERE teacher_id = ?1 AND class_id = ?2`)
      .bind(user.id, classId)
      .first();
    if (!owns) return c.json({ error: "Forbidden" }, 403);
  }

  const win = await db
    .prepare(`SELECT id, name, type FROM survey_windows WHERE id = ?1`)
    .bind(windowId)
    .first<{ id: string; name: string; type: string }>();

  if (!win) return c.json({ error: "Survey window not found" }, 404);

  const cls = await db
    .prepare(`SELECT id, name, subject, grade_level FROM classes WHERE id = ?1`)
    .bind(classId)
    .first<{ id: string; name: string; subject: string | null; grade_level: string | null }>();

  const studentCount = await db
    .prepare(`SELECT COUNT(*) as cnt FROM enrollments WHERE class_id = ?1`)
    .bind(classId)
    .first<{ cnt: number }>();

  let responses: unknown = null;

  if (win.type === "engagement_index") {
    const rows = await db
      .prepare(
        `SELECT challenge, love FROM engagement_responses
         WHERE class_id = ?1 AND survey_window_id = ?2`
      )
      .bind(classId, windowId)
      .all<{ challenge: number; love: number }>();
    responses = rows.results;
  } else if (win.type === "mattering_index") {
    const rows = await db
      .prepare(
        `SELECT connection, contribution FROM mattering_responses
         WHERE class_id = ?1 AND survey_window_id = ?2`
      )
      .bind(classId, windowId)
      .all<{ connection: number; contribution: number }>();
    responses = rows.results;
  } else {
    const rows = await db
      .prepare(
        `SELECT behavioral_effort, behavioral_focus, behavioral_respect,
                cognitive_clarity, cognitive_expectations, cognitive_feedback, cognitive_challenge,
                emotional_known, emotional_cared, emotional_motivated, emotional_enjoyment,
                instructional_activities, instructional_collaboration, instructional_assignments,
                behavioral_comments, cognitive_comments, emotional_comments, instructional_comments
         FROM dimension_responses WHERE class_id = ?1 AND survey_window_id = ?2`
      )
      .bind(classId, windowId)
      .all();
    responses = rows.results;
  }

  return c.json({
    window: win,
    class: cls,
    studentCount: studentCount?.cnt ?? 0,
    responses,
  });
});

// ─── Admin ────────────────────────────────────────────────────────────────────

app.get("/api/admin/overview", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const [students, teachers, classes, windows, eiResponses, miResponses, dimResponses] =
    await Promise.all([
      db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE role = 'student'`).first<{ cnt: number }>(),
      db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE role = 'teacher'`).first<{ cnt: number }>(),
      db.prepare(`SELECT COUNT(*) as cnt FROM classes`).first<{ cnt: number }>(),
      db.prepare(`SELECT COUNT(*) as cnt FROM survey_windows`).first<{ cnt: number }>(),
      db.prepare(`SELECT COUNT(*) as cnt FROM engagement_responses`).first<{ cnt: number }>(),
      db.prepare(`SELECT COUNT(*) as cnt FROM mattering_responses`).first<{ cnt: number }>(),
      db.prepare(`SELECT COUNT(*) as cnt FROM dimension_responses`).first<{ cnt: number }>(),
    ]);

  const activeWindows = await db
    .prepare(
      `SELECT id, name, type, opens_at, closes_at FROM survey_windows
       WHERE opens_at <= datetime('now') AND closes_at >= datetime('now')
       ORDER BY closes_at`
    )
    .all<{ id: string; name: string; type: string; opens_at: string; closes_at: string }>();

  return c.json({
    students: students?.cnt ?? 0,
    teachers: teachers?.cnt ?? 0,
    classes: classes?.cnt ?? 0,
    surveyWindows: windows?.cnt ?? 0,
    totalResponses: (eiResponses?.cnt ?? 0) + (miResponses?.cnt ?? 0) + (dimResponses?.cnt ?? 0),
    activeWindows: activeWindows.results,
  });
});

app.get("/api/admin/surveys", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const rows = await db
    .prepare(
      `SELECT sw.id, sw.name, sw.type, sw.opens_at, sw.closes_at, sw.target_all, sw.created_at,
              u.name as created_by_name
       FROM survey_windows sw JOIN users u ON u.id = sw.created_by
       ORDER BY sw.opens_at DESC`
    )
    .all();

  return c.json(rows.results);
});

app.post("/api/admin/surveys", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const { name, type, opens_at, closes_at, target_all, class_ids } =
    await c.req.json<{
      name: string;
      type: string;
      opens_at: string;
      closes_at: string;
      target_all: boolean;
      class_ids?: string[];
    }>();

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO survey_windows (id, name, type, opens_at, closes_at, target_all, created_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
    .bind(id, name, type, opens_at, closes_at, target_all ? 1 : 0, user.id)
    .run();

  if (!target_all && class_ids?.length) {
    for (const classId of class_ids) {
      await db
        .prepare(`INSERT OR IGNORE INTO survey_window_classes (survey_window_id, class_id) VALUES (?1, ?2)`)
        .bind(id, classId)
        .run();
    }
  }

  return c.json({ id });
});

app.put("/api/admin/surveys/:id", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const { id } = c.req.param();
  const { name, opens_at, closes_at } = await c.req.json<{
    name: string;
    opens_at: string;
    closes_at: string;
  }>();

  await db
    .prepare(`UPDATE survey_windows SET name = ?1, opens_at = ?2, closes_at = ?3 WHERE id = ?4`)
    .bind(name, opens_at, closes_at, id)
    .run();

  return c.json({ ok: true });
});

app.delete("/api/admin/surveys/:id", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  await db.prepare(`DELETE FROM survey_windows WHERE id = ?1`).bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

app.get("/api/admin/users", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const { search, role } = c.req.query() as { search?: string; role?: string };
  let query = `SELECT id, email, name, role, picture, veracross_id, created_at FROM users WHERE 1=1`;
  const binds: string[] = [];

  if (role) {
    query += ` AND role = ?${binds.length + 1}`;
    binds.push(role);
  }
  if (search) {
    query += ` AND (name LIKE ?${binds.length + 1} OR email LIKE ?${binds.length + 2})`;
    binds.push(`%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY name LIMIT 200`;
  const stmt = db.prepare(query);
  const rows = await stmt.bind(...binds).all();
  return c.json(rows.results);
});

app.patch("/api/admin/users/:id/role", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const { role } = await c.req.json<{ role: string }>();
  if (!["student", "teacher", "admin"].includes(role))
    return c.json({ error: "Invalid role" }, 400);

  await db
    .prepare(`UPDATE users SET role = ?1, updated_at = datetime('now') WHERE id = ?2`)
    .bind(role, c.req.param("id"))
    .run();

  return c.json({ ok: true });
});

app.get("/api/admin/classes", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const rows = await db
    .prepare(
      `SELECT c.id, c.name, c.subject, c.grade_level, c.school_year, c.term,
              COUNT(DISTINCT e.student_id) as student_count,
              COUNT(DISTINCT tc.teacher_id) as teacher_count
       FROM classes c
       LEFT JOIN enrollments e ON e.class_id = c.id
       LEFT JOIN teacher_classes tc ON tc.class_id = c.id
       GROUP BY c.id ORDER BY c.name LIMIT 500`
    )
    .all();

  return c.json(rows.results);
});

app.post("/api/admin/sync", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  try {
    const result = await syncVeracross();
    return c.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return c.json({ error: message }, 500);
  }
});

app.get("/api/admin/classes/:classId/results/:windowId", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  // Re-use teacher results handler logic
  const { classId, windowId } = c.req.param();

  const win = await db
    .prepare(`SELECT id, name, type FROM survey_windows WHERE id = ?1`)
    .bind(windowId)
    .first<{ id: string; name: string; type: string }>();
  if (!win) return c.json({ error: "Not found" }, 404);

  const cls = await db
    .prepare(`SELECT id, name, subject, grade_level FROM classes WHERE id = ?1`)
    .bind(classId)
    .first<{ id: string; name: string; subject: string | null; grade_level: string | null }>();

  const studentCount = await db
    .prepare(`SELECT COUNT(*) as cnt FROM enrollments WHERE class_id = ?1`)
    .bind(classId)
    .first<{ cnt: number }>();

  let responses: unknown = null;
  if (win.type === "engagement_index") {
    const rows = await db
      .prepare(`SELECT challenge, love FROM engagement_responses WHERE class_id = ?1 AND survey_window_id = ?2`)
      .bind(classId, windowId)
      .all();
    responses = rows.results;
  } else if (win.type === "mattering_index") {
    const rows = await db
      .prepare(`SELECT connection, contribution FROM mattering_responses WHERE class_id = ?1 AND survey_window_id = ?2`)
      .bind(classId, windowId)
      .all();
    responses = rows.results;
  } else {
    const rows = await db
      .prepare(
        `SELECT behavioral_effort, behavioral_focus, behavioral_respect,
                cognitive_clarity, cognitive_expectations, cognitive_feedback, cognitive_challenge,
                emotional_known, emotional_cared, emotional_motivated, emotional_enjoyment,
                instructional_activities, instructional_collaboration, instructional_assignments,
                behavioral_comments, cognitive_comments, emotional_comments, instructional_comments
         FROM dimension_responses WHERE class_id = ?1 AND survey_window_id = ?2`
      )
      .bind(classId, windowId)
      .all();
    responses = rows.results;
  }

  return c.json({ window: win, class: cls, studentCount: studentCount?.cnt ?? 0, responses });
});
