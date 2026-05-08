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
import { startSyncWorkflow, debugVeracrossEndpoint, type SyncPhase } from "./veracross";

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
      `SELECT c.id, c.name, c.subject, c.grade_level, c.begin_date, c.end_date
       FROM enrollments e JOIN classes c ON c.id = e.class_id
       WHERE e.student_id = ?1
         AND (
           e.class_status IS NULL
           OR LOWER(e.class_status) != 'completed'
           OR (c.end_date IS NOT NULL AND c.end_date > datetime('now'))
         )
       ORDER BY c.name`
    )
    .bind(user.id)
    .all<{ id: string; name: string; subject: string | null; grade_level: string | null; begin_date: string | null; end_date: string | null }>();

  const windows = await db
    .prepare(
      `SELECT id, name, type, opens_at, closes_at FROM survey_windows
       WHERE datetime(opens_at) <= datetime('now') AND datetime(closes_at) >= datetime('now')
       ORDER BY closes_at`
    )
    .all<{ id: string; name: string; type: string; opens_at: string; closes_at: string }>();

  const result = [];
  for (const win of windows.results) {
    const entries = [];
    for (const cls of classes.results) {
      // If the class has a known date range, skip it when the window opens
      // outside that range (semester-1 class appearing in a semester-2 window).
      if (cls.begin_date && cls.end_date) {
        if (win.opens_at < cls.begin_date || win.opens_at > cls.end_date) continue;
      }

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

  const classInfo = await db
    .prepare(`SELECT name, primary_teacher_name FROM classes WHERE id = ?1`)
    .bind(classId)
    .first<{ name: string; primary_teacher_name: string | null }>();

  await db
    .prepare(
      `INSERT INTO engagement_responses (id, student_id, class_id, survey_window_id, challenge, love, class_name, teacher_name, student_name)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT(student_id, class_id, survey_window_id) DO UPDATE SET
         challenge = excluded.challenge, love = excluded.love, submitted_at = datetime('now'),
         class_name = excluded.class_name, teacher_name = excluded.teacher_name, student_name = excluded.student_name`
    )
    .bind(crypto.randomUUID(), user.id, classId, surveyWindowId, challenge, love,
      classInfo?.name ?? null, classInfo?.primary_teacher_name ?? null, user.name)
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

  const classInfo = await db
    .prepare(`SELECT name, primary_teacher_name FROM classes WHERE id = ?1`)
    .bind(classId)
    .first<{ name: string; primary_teacher_name: string | null }>();

  await db
    .prepare(
      `INSERT INTO mattering_responses (id, student_id, class_id, survey_window_id, connection, contribution, class_name, teacher_name, student_name)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT(student_id, class_id, survey_window_id) DO UPDATE SET
         connection = excluded.connection, contribution = excluded.contribution, submitted_at = datetime('now'),
         class_name = excluded.class_name, teacher_name = excluded.teacher_name, student_name = excluded.student_name`
    )
    .bind(crypto.randomUUID(), user.id, classId, surveyWindowId, connection, contribution,
      classInfo?.name ?? null, classInfo?.primary_teacher_name ?? null, user.name)
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

  const dimClassInfo = await db
    .prepare(`SELECT name, primary_teacher_name FROM classes WHERE id = ?1`)
    .bind(body.classId)
    .first<{ name: string; primary_teacher_name: string | null }>();

  await db
    .prepare(
      `INSERT INTO dimension_responses (
         id, student_id, class_id, survey_window_id,
         behavioral_effort, behavioral_focus, behavioral_respect,
         cognitive_clarity, cognitive_expectations, cognitive_feedback, cognitive_challenge,
         emotional_known, emotional_cared, emotional_motivated, emotional_enjoyment,
         instructional_activities, instructional_collaboration, instructional_assignments,
         behavioral_comments, cognitive_comments, emotional_comments, instructional_comments,
         class_name, teacher_name, student_name
       ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25)
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
         class_name=excluded.class_name, teacher_name=excluded.teacher_name, student_name=excluded.student_name,
         submitted_at=datetime('now')`
    )
    .bind(
      crypto.randomUUID(), user.id, body.classId, body.surveyWindowId,
      body.behavioral_effort, body.behavioral_focus, body.behavioral_respect,
      body.cognitive_clarity, body.cognitive_expectations, body.cognitive_feedback, body.cognitive_challenge,
      body.emotional_known, body.emotional_cared, body.emotional_motivated, body.emotional_enjoyment,
      body.instructional_activities, body.instructional_collaboration, body.instructional_assignments,
      body.behavioral_comments || "", body.cognitive_comments || "",
      body.emotional_comments || "", body.instructional_comments || "",
      dimClassInfo?.name ?? null, dimClassInfo?.primary_teacher_name ?? null, user.name
    )
    .run();

  return c.json({ ok: true });
});

// ─── Teacher ─────────────────────────────────────────────────────────────────

function syStartDate(): string {
  const now = new Date();
  const year = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${year}-08-01`;
}

app.get("/api/teacher/classes", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "teacher" && user.role !== "admin")
    return c.json({ error: "Forbidden" }, 403);

  const classes = await db
    .prepare(
      `SELECT c.id, c.name, c.subject, c.grade_level, c.school_year, c.term, c.veracross_id, c.begin_date
       FROM teacher_classes tc JOIN classes c ON c.id = tc.class_id
       WHERE tc.teacher_id = ?1 ORDER BY c.name`
    )
    .bind(user.id)
    .all<{ id: string; name: string; subject: string | null; grade_level: string | null; school_year: string | null; term: string | null; veracross_id: string | null; begin_date: string | null }>();

  const syStart = syStartDate();

  // Batch school-year EI/MI stats across all teacher classes in two queries
  const syEiAll = await db
    .prepare(
      `SELECT er.class_id, AVG(er.challenge) as avg_c, AVG(er.love) as avg_l, COUNT(*) as cnt
       FROM engagement_responses er
       JOIN survey_windows sw ON sw.id = er.survey_window_id
       JOIN teacher_classes tc ON tc.class_id = er.class_id AND tc.teacher_id = ?1
       WHERE datetime(sw.opens_at) >= ?2
       GROUP BY er.class_id`
    )
    .bind(user.id, syStart)
    .all<{ class_id: string; avg_c: number | null; avg_l: number | null; cnt: number }>();
  const syMiAll = await db
    .prepare(
      `SELECT mr.class_id, AVG(mr.connection) as avg_c, AVG(mr.contribution) as avg_l, COUNT(*) as cnt
       FROM mattering_responses mr
       JOIN survey_windows sw ON sw.id = mr.survey_window_id
       JOIN teacher_classes tc ON tc.class_id = mr.class_id AND tc.teacher_id = ?1
       WHERE datetime(sw.opens_at) >= ?2
       GROUP BY mr.class_id`
    )
    .bind(user.id, syStart)
    .all<{ class_id: string; avg_c: number | null; avg_l: number | null; cnt: number }>();

  const eiMap = new Map((syEiAll.results ?? []).map((r) => [r.class_id, r]));
  const miMap = new Map((syMiAll.results ?? []).map((r) => [r.class_id, r]));

  // For each class, get student count and survey windows
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
      sy_ei: eiMap.get(cls.id) ?? null,
      sy_mi: miMap.get(cls.id) ?? null,
    });
  }

  return c.json(result);
});

// Teacher overview: cross-class aggregates for the current school year
app.get("/api/teacher/overview", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "teacher" && user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const syStart = syStartDate();

  const ei = await db
    .prepare(
      `SELECT AVG(er.challenge) as avg_c, AVG(er.love) as avg_l, COUNT(*) as cnt,
              COUNT(DISTINCT er.survey_window_id) as win_cnt,
              COUNT(DISTINCT er.class_id) as class_cnt
       FROM engagement_responses er
       JOIN survey_windows sw ON sw.id = er.survey_window_id
       JOIN teacher_classes tc ON tc.class_id = er.class_id AND tc.teacher_id = ?1
       WHERE datetime(sw.opens_at) >= ?2`
    )
    .bind(user.id, syStart)
    .first<{ avg_c: number | null; avg_l: number | null; cnt: number; win_cnt: number; class_cnt: number }>();

  const mi = await db
    .prepare(
      `SELECT AVG(mr.connection) as avg_c, AVG(mr.contribution) as avg_l, COUNT(*) as cnt
       FROM mattering_responses mr
       JOIN survey_windows sw ON sw.id = mr.survey_window_id
       JOIN teacher_classes tc ON tc.class_id = mr.class_id AND tc.teacher_id = ?1
       WHERE datetime(sw.opens_at) >= ?2`
    )
    .bind(user.id, syStart)
    .first<{ avg_c: number | null; avg_l: number | null; cnt: number }>();

  const eiPoints = await db
    .prepare(
      `SELECT er.challenge, er.love
       FROM engagement_responses er
       JOIN survey_windows sw ON sw.id = er.survey_window_id
       JOIN teacher_classes tc ON tc.class_id = er.class_id AND tc.teacher_id = ?1
       WHERE datetime(sw.opens_at) >= ?2`
    )
    .bind(user.id, syStart)
    .all<{ challenge: number; love: number }>();

  return c.json({
    school_year: {
      ei,
      mi,
      ei_points: eiPoints.results ?? [],
      since: syStart,
    },
  });
});

// Teacher: browse all classes and claim ones they teach
app.get("/api/teacher/all-classes", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "teacher" && user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const rows = await db
    .prepare(
      `SELECT c.id, c.name, c.subject, c.grade_level, c.school_year,
              c.primary_teacher_name, c.primary_teacher_vc_id,
              CASE WHEN tc.teacher_id = ?1 THEN 1 ELSE 0 END as is_mine,
              COUNT(DISTINCT e.student_id) as student_count
       FROM classes c
       LEFT JOIN teacher_classes tc ON tc.class_id = c.id AND tc.teacher_id = ?1
       LEFT JOIN enrollments e ON e.class_id = c.id
       GROUP BY c.id ORDER BY c.name LIMIT 5000`
    )
    .bind(user.id)
    .all();

  return c.json(rows.results);
});

// Teacher: claim (or unclaim) a class
app.post("/api/teacher/claim-class/:classId", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "teacher" && user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const { classId } = c.req.param();
  const { claim } = await c.req.json<{ claim: boolean }>();

  if (claim) {
    await db
      .prepare(`INSERT OR IGNORE INTO teacher_classes (id, teacher_id, class_id) VALUES (?1, ?2, ?3)`)
      .bind(crypto.randomUUID(), user.id, classId)
      .run();
  } else {
    await db
      .prepare(`DELETE FROM teacher_classes WHERE teacher_id = ?1 AND class_id = ?2`)
      .bind(user.id, classId)
      .run();
  }

  return c.json({ ok: true });
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
      // Count distinct (student, window) pairs — one submission per student per survey
      db.prepare(`SELECT COUNT(DISTINCT student_id || '|' || survey_window_id) as cnt FROM engagement_responses`).first<{ cnt: number }>(),
      db.prepare(`SELECT COUNT(DISTINCT student_id || '|' || survey_window_id) as cnt FROM mattering_responses`).first<{ cnt: number }>(),
      db.prepare(`SELECT COUNT(DISTINCT student_id || '|' || survey_window_id) as cnt FROM dimension_responses`).first<{ cnt: number }>(),
    ]);

  const activeWindows = await db
    .prepare(
      `SELECT id, name, type, opens_at, closes_at FROM survey_windows
       WHERE datetime(opens_at) <= datetime('now') AND datetime(closes_at) >= datetime('now')
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

app.get("/api/admin/overview/concerns", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const rows = await db
    .prepare(
      `SELECT
         er.survey_window_id,
         sw.name               AS window_name,
         sw.opens_at,
         er.class_id,
         COALESCE(MAX(er.class_name), c.name) AS class_name,
         COALESCE(c.primary_teacher_name, MAX(er.teacher_name)) AS teacher_name,
         COUNT(*)              AS total,
         SUM(CASE WHEN er.challenge > 5 AND er.love <= 5 THEN 1 ELSE 0 END) AS anxiety_cnt,
         SUM(CASE WHEN er.challenge <= 5 AND er.love <= 5 THEN 1 ELSE 0 END) AS boredom_cnt,
         ROUND(AVG(er.challenge), 1) AS avg_c,
         ROUND(AVG(er.love), 1)      AS avg_l
       FROM engagement_responses er
       JOIN survey_windows sw ON sw.id = er.survey_window_id
       LEFT JOIN classes c ON c.id = er.class_id
       WHERE datetime(sw.opens_at) >= datetime('now', '-90 days')
       GROUP BY er.survey_window_id, er.class_id
       HAVING total >= 3
          AND (anxiety_cnt + boredom_cnt) * 1.0 / total >= 0.5
       ORDER BY (anxiety_cnt + boredom_cnt) * 1.0 / total DESC, sw.opens_at DESC
       LIMIT 30`
    )
    .all<{
      survey_window_id: string; window_name: string; opens_at: string;
      class_id: string; class_name: string | null; teacher_name: string | null;
      total: number; anxiety_cnt: number; boredom_cnt: number;
      avg_c: number | null; avg_l: number | null;
    }>();

  return c.json(rows.results);
});

app.get("/api/admin/flagged", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const windowId = c.req.query("windowId");

  // Flagged = response in anxiety zone (challenge > 5 AND love <= 5)
  //        or boredom zone (challenge <= 5 AND love <= 5)
  // i.e. love <= 5 for any challenge value
  const windowFilter = windowId ? `AND er.survey_window_id = '${windowId}'` : "";

  const rows = await db
    .prepare(
      `SELECT
         er.id,
         er.student_id,
         COALESCE(er.student_name, u.name) AS student_name,
         u.picture AS student_picture,
         er.class_id,
         COALESCE(er.class_name, c.name)   AS class_name,
         COALESCE(er.teacher_name, c.primary_teacher_name) AS teacher_name,
         er.challenge,
         er.love,
         er.submitted_at,
         er.survey_window_id,
         sw.name AS window_name,
         CASE
           WHEN er.challenge > 5 AND er.love <= 5 THEN 'anxiety'
           ELSE 'boredom'
         END AS zone
       FROM engagement_responses er
       JOIN survey_windows sw ON sw.id = er.survey_window_id
       JOIN users u ON u.id = er.student_id
       LEFT JOIN classes c ON c.id = er.class_id
       WHERE er.love <= 5
         ${windowFilter}
       ORDER BY u.name, er.love ASC, er.submitted_at DESC`
    )
    .all<{
      id: string; student_id: string; student_name: string | null; student_picture: string | null;
      class_id: string; class_name: string | null; teacher_name: string | null;
      challenge: number; love: number; submitted_at: string;
      survey_window_id: string; window_name: string; zone: string;
    }>();

  return c.json(rows.results);
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
  const normOpen = opens_at.replace("T", " ");
  const normClose = closes_at.replace("T", " ");
  await db
    .prepare(
      `INSERT INTO survey_windows (id, name, type, opens_at, closes_at, target_all, created_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
    .bind(id, name, type, normOpen, normClose, target_all ? 1 : 0, user.id)
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
    .bind(name, opens_at.replace("T", " "), closes_at.replace("T", " "), id)
    .run();

  return c.json({ ok: true });
});

app.get("/api/admin/surveys/:windowId/detail", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const { windowId } = c.req.param();

  const win = await db
    .prepare(`SELECT id, name, type, opens_at, closes_at, target_all FROM survey_windows WHERE id = ?1`)
    .bind(windowId)
    .first<{ id: string; name: string; type: string; opens_at: string; closes_at: string; target_all: number }>();
  if (!win) return c.json({ error: "Not found" }, 404);

  // Eligible students
  let eligible: number;
  if (win.target_all === 1) {
    const row = await db.prepare(`SELECT COUNT(DISTINCT student_id) as cnt FROM enrollments`).first<{ cnt: number }>();
    eligible = row?.cnt ?? 0;
  } else {
    const row = await db
      .prepare(
        `SELECT COUNT(DISTINCT e.student_id) as cnt
         FROM enrollments e JOIN survey_window_classes swc ON swc.class_id = e.class_id
         WHERE swc.survey_window_id = ?1`
      )
      .bind(windowId)
      .first<{ cnt: number }>();
    eligible = row?.cnt ?? 0;
  }

  // Responses
  let responses: unknown[] = [];
  if (win.type === "engagement_index") {
    const rows = await db
      .prepare(
        `SELECT er.student_id,
                COALESCE(er.student_name, u.name) as student_name,
                er.class_id,
                COALESCE(er.class_name, c.name) as class_name,
                COALESCE(er.teacher_name, c.primary_teacher_name) as teacher_name,
                er.challenge, er.love, er.submitted_at
         FROM engagement_responses er
         LEFT JOIN users u ON u.id = er.student_id
         LEFT JOIN classes c ON c.id = er.class_id
         WHERE er.survey_window_id = ?1
         ORDER BY er.submitted_at DESC`
      )
      .bind(windowId)
      .all();
    responses = rows.results ?? [];
  } else if (win.type === "mattering_index") {
    const rows = await db
      .prepare(
        `SELECT mr.student_id,
                COALESCE(mr.student_name, u.name) as student_name,
                mr.class_id,
                COALESCE(mr.class_name, c.name) as class_name,
                COALESCE(mr.teacher_name, c.primary_teacher_name) as teacher_name,
                mr.connection, mr.contribution, mr.submitted_at
         FROM mattering_responses mr
         LEFT JOIN users u ON u.id = mr.student_id
         LEFT JOIN classes c ON c.id = mr.class_id
         WHERE mr.survey_window_id = ?1
         ORDER BY mr.submitted_at DESC`
      )
      .bind(windowId)
      .all();
    responses = rows.results ?? [];
  }

  return c.json({ window: win, eligible, responses });
});

app.delete("/api/admin/surveys/:id", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const id = c.req.param("id");
  // Delete responses first (FK constraints prevent deleting the window otherwise)
  await db.batch([
    db.prepare(`DELETE FROM engagement_responses WHERE survey_window_id = ?1`).bind(id),
    db.prepare(`DELETE FROM mattering_responses WHERE survey_window_id = ?1`).bind(id),
    db.prepare(`DELETE FROM dimension_responses WHERE survey_window_id = ?1`).bind(id),
    db.prepare(`DELETE FROM survey_windows WHERE id = ?1`).bind(id),
  ]);
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

app.get("/api/admin/users/:userId/overview", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const { userId } = c.req.param();
  const syStart = syStartDate();

  const ei = await db
    .prepare(
      `SELECT AVG(er.challenge) as avg_c, AVG(er.love) as avg_l, COUNT(*) as cnt,
              COUNT(DISTINCT er.survey_window_id) as win_cnt,
              COUNT(DISTINCT er.class_id) as class_cnt
       FROM engagement_responses er
       JOIN survey_windows sw ON sw.id = er.survey_window_id
       JOIN teacher_classes tc ON tc.class_id = er.class_id AND tc.teacher_id = ?1
       WHERE datetime(sw.opens_at) >= ?2`
    )
    .bind(userId, syStart)
    .first<{ avg_c: number | null; avg_l: number | null; cnt: number; win_cnt: number; class_cnt: number }>();

  const mi = await db
    .prepare(
      `SELECT AVG(mr.connection) as avg_c, AVG(mr.contribution) as avg_l, COUNT(*) as cnt
       FROM mattering_responses mr
       JOIN survey_windows sw ON sw.id = mr.survey_window_id
       JOIN teacher_classes tc ON tc.class_id = mr.class_id AND tc.teacher_id = ?1
       WHERE datetime(sw.opens_at) >= ?2`
    )
    .bind(userId, syStart)
    .first<{ avg_c: number | null; avg_l: number | null; cnt: number }>();

  const eiPoints = await db
    .prepare(
      `SELECT er.challenge, er.love
       FROM engagement_responses er
       JOIN survey_windows sw ON sw.id = er.survey_window_id
       JOIN teacher_classes tc ON tc.class_id = er.class_id AND tc.teacher_id = ?1
       WHERE datetime(sw.opens_at) >= ?2`
    )
    .bind(userId, syStart)
    .all<{ challenge: number; love: number }>();

  return c.json({
    school_year: { ei, mi, ei_points: eiPoints.results ?? [], since: syStart },
  });
});

app.get("/api/admin/users/:userId/profile", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const { userId } = c.req.param();

  const profile = await db
    .prepare(`SELECT id, name, email, picture, veracross_id, role, created_at FROM users WHERE id = ?1`)
    .bind(userId)
    .first<{ id: string; name: string; email: string; picture: string | null; veracross_id: string | null; role: string; created_at: string }>();
  if (!profile) return c.json({ error: "Not found" }, 404);

  // Teachers/admins: return classes they teach with student counts
  if (profile.role === "teacher" || profile.role === "admin") {
    const taught = await db
      .prepare(
        `SELECT c.id, c.name, c.grade_level, c.primary_teacher_name,
                COUNT(DISTINCT e.student_id) as student_count
         FROM teacher_classes tc
         JOIN classes c ON c.id = tc.class_id
         LEFT JOIN enrollments e ON e.class_id = c.id
         WHERE tc.teacher_id = ?1
         GROUP BY c.id ORDER BY c.name`
      )
      .bind(userId)
      .all<{ id: string; name: string; grade_level: string | null; primary_teacher_name: string | null; student_count: number }>();

    return c.json({ profile, teaches: taught.results ?? [], classes: [] });
  }

  // Students: return enrolled classes with full survey response history
  const classRows = await db
    .prepare(
      `SELECT c.id, c.name, c.grade_level, c.primary_teacher_name
       FROM enrollments e JOIN classes c ON c.id = e.class_id
       WHERE e.student_id = ?1 ORDER BY c.name`
    )
    .bind(userId)
    .all<{ id: string; name: string; grade_level: string | null; primary_teacher_name: string | null }>();

  const [eiRows, miRows, dimRows] = await Promise.all([
    db.prepare(
      `SELECT er.class_id, er.challenge, er.love, er.submitted_at,
              sw.id as window_id, sw.name as window_name, sw.opens_at, sw.closes_at
       FROM engagement_responses er
       JOIN survey_windows sw ON sw.id = er.survey_window_id
       WHERE er.student_id = ?1 ORDER BY sw.opens_at DESC`
    ).bind(userId).all<{ class_id: string; challenge: number; love: number; submitted_at: string; window_id: string; window_name: string; opens_at: string; closes_at: string }>(),

    db.prepare(
      `SELECT mr.class_id, mr.connection, mr.contribution, mr.submitted_at,
              sw.id as window_id, sw.name as window_name, sw.opens_at, sw.closes_at
       FROM mattering_responses mr
       JOIN survey_windows sw ON sw.id = mr.survey_window_id
       WHERE mr.student_id = ?1 ORDER BY sw.opens_at DESC`
    ).bind(userId).all<{ class_id: string; connection: number; contribution: number; submitted_at: string; window_id: string; window_name: string; opens_at: string; closes_at: string }>(),

    db.prepare(
      `SELECT dr.class_id, dr.submitted_at,
              dr.behavioral_effort, dr.behavioral_focus, dr.behavioral_respect,
              dr.cognitive_clarity, dr.cognitive_expectations, dr.cognitive_feedback, dr.cognitive_challenge,
              dr.emotional_known, dr.emotional_cared, dr.emotional_motivated, dr.emotional_enjoyment,
              dr.instructional_activities, dr.instructional_collaboration, dr.instructional_assignments,
              sw.id as window_id, sw.name as window_name, sw.opens_at, sw.closes_at
       FROM dimension_responses dr
       JOIN survey_windows sw ON sw.id = dr.survey_window_id
       WHERE dr.student_id = ?1 ORDER BY sw.opens_at DESC`
    ).bind(userId).all(),
  ]);

  // Group responses by class_id
  type Response = Record<string, unknown> & { type: string };
  const responsesByClass = new Map<string, Response[]>();

  for (const r of eiRows.results ?? []) {
    const arr = responsesByClass.get(r.class_id) ?? [];
    arr.push({ ...r, type: "engagement_index" });
    responsesByClass.set(r.class_id, arr);
  }
  for (const r of miRows.results ?? []) {
    const arr = responsesByClass.get(r.class_id) ?? [];
    arr.push({ ...r, type: "mattering_index" });
    responsesByClass.set(r.class_id, arr);
  }
  for (const r of (dimRows.results ?? []) as (Record<string, unknown> & { class_id: string })[]) {
    const arr = responsesByClass.get(r.class_id) ?? [];
    arr.push({ ...r, type: "dimensions" });
    responsesByClass.set(r.class_id, arr);
  }

  // Sort each class's responses newest first
  for (const arr of responsesByClass.values()) {
    arr.sort((a, b) => String(b.opens_at ?? "").localeCompare(String(a.opens_at ?? "")));
  }

  const classes = (classRows.results ?? []).map((cls) => ({
    ...cls,
    responses: responsesByClass.get(cls.id) ?? [],
  }));

  return c.json({ profile, teaches: [], classes });
});

app.get("/api/admin/classes", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const syStart = syStartDate();
  const rows = await db
    .prepare(
      `SELECT c.id, c.name, c.subject, c.grade_level, c.school_year, c.term, c.veracross_id, c.begin_date, c.end_date,
              c.primary_teacher_name,
              u.picture as teacher_picture,
              COUNT(DISTINCT e.student_id) as student_count,
              COUNT(DISTINCT tc.teacher_id) as teacher_count
       FROM classes c
       LEFT JOIN enrollments e ON e.class_id = c.id
       LEFT JOIN teacher_classes tc ON tc.class_id = c.id
       LEFT JOIN users u ON u.id = tc.teacher_id AND u.role IN ('teacher','admin')
       WHERE c.end_date IS NULL OR c.end_date >= ?1
       GROUP BY c.id ORDER BY c.name LIMIT 5000`
    )
    .bind(syStart)
    .all();

  const eiStats = await db
    .prepare(
      `SELECT er.class_id, AVG(er.challenge) as avg_c, AVG(er.love) as avg_l, COUNT(*) as cnt
       FROM engagement_responses er
       JOIN survey_windows sw ON sw.id = er.survey_window_id
       WHERE datetime(sw.opens_at) >= ?1
       GROUP BY er.class_id`
    )
    .bind(syStart)
    .all<{ class_id: string; avg_c: number | null; avg_l: number | null; cnt: number }>();
  const eiMap = new Map((eiStats.results ?? []).map((r) => [r.class_id, r]));

  const result = (rows.results ?? []).map((cls: Record<string, unknown>) => ({
    ...cls,
    sy_ei: eiMap.get(cls.id as string) ?? null,
  }));

  return c.json(result);
});

// ─── Teacher Class Aggregates ─────────────────────────────────────────────────

app.get("/api/teacher/classes/:classId/aggregates", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "teacher" && user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const { classId } = c.req.param();

  // Verify teacher link (admins bypass)
  if (user.role !== "admin") {
    const owns = await db
      .prepare(`SELECT 1 FROM teacher_classes WHERE teacher_id = ?1 AND class_id = ?2`)
      .bind(user.id, classId)
      .first();
    if (!owns) return c.json({ error: "Forbidden" }, 403);
  }

  const cls = await db
    .prepare(`SELECT id, name, veracross_id, grade_level, primary_teacher_name, begin_date, end_date FROM classes WHERE id = ?1`)
    .bind(classId)
    .first<{ id: string; name: string; veracross_id: string | null; grade_level: string | null; primary_teacher_name: string | null; begin_date: string | null; end_date: string | null }>();
  if (!cls) return c.json({ error: "Not found" }, 404);

  const studentCountRow = await db
    .prepare(`SELECT COUNT(*) as cnt FROM enrollments WHERE class_id = ?1`)
    .bind(classId)
    .first<{ cnt: number }>();

  // Latest window that has any EI or MI response for this class
  const latestWindow = await db
    .prepare(
      `SELECT sw.id, sw.name, sw.opens_at FROM survey_windows sw
       WHERE sw.id IN (
         SELECT DISTINCT survey_window_id FROM engagement_responses WHERE class_id = ?1
         UNION SELECT DISTINCT survey_window_id FROM mattering_responses WHERE class_id = ?1
       ) ORDER BY sw.opens_at DESC LIMIT 1`
    )
    .bind(classId)
    .first<{ id: string; name: string; opens_at: string }>();

  let latest_window = null;
  if (latestWindow) {
    const eiAgg = await db
      .prepare(`SELECT AVG(challenge) as avg_c, AVG(love) as avg_l, COUNT(*) as cnt FROM engagement_responses WHERE class_id = ?1 AND survey_window_id = ?2`)
      .bind(classId, latestWindow.id)
      .first<{ avg_c: number | null; avg_l: number | null; cnt: number }>();
    const miAgg = await db
      .prepare(`SELECT AVG(connection) as avg_c, AVG(contribution) as avg_l, COUNT(*) as cnt FROM mattering_responses WHERE class_id = ?1 AND survey_window_id = ?2`)
      .bind(classId, latestWindow.id)
      .first<{ avg_c: number | null; avg_l: number | null; cnt: number }>();
    const eiPoints = await db
      .prepare(`SELECT challenge, love FROM engagement_responses WHERE class_id = ?1 AND survey_window_id = ?2`)
      .bind(classId, latestWindow.id)
      .all<{ challenge: number; love: number }>();
    latest_window = {
      window: latestWindow,
      ei: eiAgg,
      mi: miAgg,
      ei_points: eiPoints.results ?? [],
    };
  }

  // School year aggregate
  const schoolYearStart = cls.begin_date ?? `datetime('now', '-1 year')`;
  const syStartParam = cls.begin_date ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const syEiWinCount = await db
    .prepare(`SELECT COUNT(DISTINCT er.survey_window_id) as cnt FROM engagement_responses er JOIN survey_windows sw ON sw.id = er.survey_window_id WHERE er.class_id = ?1 AND datetime(sw.opens_at) >= ?2`)
    .bind(classId, syStartParam)
    .first<{ cnt: number }>();
  const syMiWinCount = await db
    .prepare(`SELECT COUNT(DISTINCT mr.survey_window_id) as cnt FROM mattering_responses mr JOIN survey_windows sw ON sw.id = mr.survey_window_id WHERE mr.class_id = ?1 AND datetime(sw.opens_at) >= ?2`)
    .bind(classId, syStartParam)
    .first<{ cnt: number }>();
  const syEi = await db
    .prepare(`SELECT AVG(er.challenge) as avg_c, AVG(er.love) as avg_l, COUNT(*) as cnt FROM engagement_responses er JOIN survey_windows sw ON sw.id = er.survey_window_id WHERE er.class_id = ?1 AND datetime(sw.opens_at) >= ?2`)
    .bind(classId, syStartParam)
    .first<{ avg_c: number | null; avg_l: number | null; cnt: number }>();
  const syMi = await db
    .prepare(`SELECT AVG(mr.connection) as avg_c, AVG(mr.contribution) as avg_l, COUNT(*) as cnt FROM mattering_responses mr JOIN survey_windows sw ON sw.id = mr.survey_window_id WHERE mr.class_id = ?1 AND datetime(sw.opens_at) >= ?2`)
    .bind(classId, syStartParam)
    .first<{ avg_c: number | null; avg_l: number | null; cnt: number }>();
  const syEiPoints = await db
    .prepare(`SELECT er.challenge, er.love FROM engagement_responses er JOIN survey_windows sw ON sw.id = er.survey_window_id WHERE er.class_id = ?1 AND datetime(sw.opens_at) >= ?2`)
    .bind(classId, syStartParam)
    .all<{ challenge: number; love: number }>();

  // Lifetime course aggregate (this teacher, same course name across all their sections)
  const teacherId = user.role === "admin" ? null : user.id;
  let lifetimeEi, lifetimeMi, lifetimeEiPoints;
  if (teacherId) {
    lifetimeEi = await db
      .prepare(
        `SELECT AVG(er.challenge) as avg_c, AVG(er.love) as avg_l, COUNT(*) as ei_cnt, COUNT(DISTINCT er.survey_window_id) as win_cnt
         FROM engagement_responses er
         JOIN classes c ON c.id = er.class_id
         JOIN teacher_classes tc ON tc.class_id = c.id
         WHERE c.name = ?1 AND tc.teacher_id = ?2`
      )
      .bind(cls.name, teacherId)
      .first<{ avg_c: number | null; avg_l: number | null; ei_cnt: number; win_cnt: number }>();
    lifetimeMi = await db
      .prepare(
        `SELECT AVG(mr.connection) as avg_c, AVG(mr.contribution) as avg_l, COUNT(*) as ei_cnt, COUNT(DISTINCT mr.survey_window_id) as win_cnt
         FROM mattering_responses mr
         JOIN classes c ON c.id = mr.class_id
         JOIN teacher_classes tc ON tc.class_id = c.id
         WHERE c.name = ?1 AND tc.teacher_id = ?2`
      )
      .bind(cls.name, teacherId)
      .first<{ avg_c: number | null; avg_l: number | null; ei_cnt: number; win_cnt: number }>();
    const ltPts = await db
      .prepare(
        `SELECT er.challenge, er.love FROM engagement_responses er
         JOIN classes c ON c.id = er.class_id
         JOIN teacher_classes tc ON tc.class_id = c.id
         WHERE c.name = ?1 AND tc.teacher_id = ?2`
      )
      .bind(cls.name, teacherId)
      .all<{ challenge: number; love: number }>();
    lifetimeEiPoints = ltPts.results ?? [];
  } else {
    lifetimeEi = await db
      .prepare(
        `SELECT AVG(er.challenge) as avg_c, AVG(er.love) as avg_l, COUNT(*) as ei_cnt, COUNT(DISTINCT er.survey_window_id) as win_cnt
         FROM engagement_responses er
         JOIN classes c ON c.id = er.class_id
         WHERE c.name = ?1`
      )
      .bind(cls.name)
      .first<{ avg_c: number | null; avg_l: number | null; ei_cnt: number; win_cnt: number }>();
    lifetimeMi = await db
      .prepare(
        `SELECT AVG(mr.connection) as avg_c, AVG(mr.contribution) as avg_l, COUNT(*) as ei_cnt, COUNT(DISTINCT mr.survey_window_id) as win_cnt
         FROM mattering_responses mr
         JOIN classes c ON c.id = mr.class_id
         WHERE c.name = ?1`
      )
      .bind(cls.name)
      .first<{ avg_c: number | null; avg_l: number | null; ei_cnt: number; win_cnt: number }>();
    const ltPts = await db
      .prepare(
        `SELECT er.challenge, er.love FROM engagement_responses er
         JOIN classes c ON c.id = er.class_id WHERE c.name = ?1`
      )
      .bind(cls.name)
      .all<{ challenge: number; love: number }>();
    lifetimeEiPoints = ltPts.results ?? [];
  }

  const lifetimeClassCount = await db
    .prepare(`SELECT COUNT(DISTINCT id) as cnt FROM classes WHERE name = ?1`)
    .bind(cls.name)
    .first<{ cnt: number }>();

  return c.json({
    cls: { ...cls, studentCount: studentCountRow?.cnt ?? 0 },
    latest_window,
    school_year: {
      ei: syEi,
      mi: syMi,
      window_count: Math.max(syEiWinCount?.cnt ?? 0, syMiWinCount?.cnt ?? 0),
      ei_points: syEiPoints.results ?? [],
    },
    lifetime_course: {
      ei: lifetimeEi,
      mi: lifetimeMi,
      class_count: lifetimeClassCount?.cnt ?? 0,
      ei_points: lifetimeEiPoints,
    },
  });
});

// ─── Admin Class Aggregates ───────────────────────────────────────────────────

app.get("/api/admin/classes/:classId/aggregates", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const { classId } = c.req.param();

  const cls = await db
    .prepare(`SELECT id, name, veracross_id, grade_level, primary_teacher_name, begin_date, end_date FROM classes WHERE id = ?1`)
    .bind(classId)
    .first<{ id: string; name: string; veracross_id: string | null; grade_level: string | null; primary_teacher_name: string | null; begin_date: string | null; end_date: string | null }>();
  if (!cls) return c.json({ error: "Not found" }, 404);

  const studentCountRow = await db
    .prepare(`SELECT COUNT(*) as cnt FROM enrollments WHERE class_id = ?1`)
    .bind(classId)
    .first<{ cnt: number }>();

  const latestWindow = await db
    .prepare(
      `SELECT sw.id, sw.name, sw.opens_at FROM survey_windows sw
       WHERE sw.id IN (
         SELECT DISTINCT survey_window_id FROM engagement_responses WHERE class_id = ?1
         UNION SELECT DISTINCT survey_window_id FROM mattering_responses WHERE class_id = ?1
       ) ORDER BY sw.opens_at DESC LIMIT 1`
    )
    .bind(classId)
    .first<{ id: string; name: string; opens_at: string }>();

  let latest_window = null;
  if (latestWindow) {
    const eiAgg = await db
      .prepare(`SELECT AVG(challenge) as avg_c, AVG(love) as avg_l, COUNT(*) as cnt FROM engagement_responses WHERE class_id = ?1 AND survey_window_id = ?2`)
      .bind(classId, latestWindow.id)
      .first<{ avg_c: number | null; avg_l: number | null; cnt: number }>();
    const miAgg = await db
      .prepare(`SELECT AVG(connection) as avg_c, AVG(contribution) as avg_l, COUNT(*) as cnt FROM mattering_responses WHERE class_id = ?1 AND survey_window_id = ?2`)
      .bind(classId, latestWindow.id)
      .first<{ avg_c: number | null; avg_l: number | null; cnt: number }>();
    const eiPoints = await db
      .prepare(`SELECT challenge, love FROM engagement_responses WHERE class_id = ?1 AND survey_window_id = ?2`)
      .bind(classId, latestWindow.id)
      .all<{ challenge: number; love: number }>();
    latest_window = { window: latestWindow, ei: eiAgg, mi: miAgg, ei_points: eiPoints.results ?? [] };
  }

  const syStartParam = cls.begin_date ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const syEiWinCount = await db
    .prepare(`SELECT COUNT(DISTINCT er.survey_window_id) as cnt FROM engagement_responses er JOIN survey_windows sw ON sw.id = er.survey_window_id WHERE er.class_id = ?1 AND datetime(sw.opens_at) >= ?2`)
    .bind(classId, syStartParam)
    .first<{ cnt: number }>();
  const syMiWinCount = await db
    .prepare(`SELECT COUNT(DISTINCT mr.survey_window_id) as cnt FROM mattering_responses mr JOIN survey_windows sw ON sw.id = mr.survey_window_id WHERE mr.class_id = ?1 AND datetime(sw.opens_at) >= ?2`)
    .bind(classId, syStartParam)
    .first<{ cnt: number }>();
  const syEi = await db
    .prepare(`SELECT AVG(er.challenge) as avg_c, AVG(er.love) as avg_l, COUNT(*) as cnt FROM engagement_responses er JOIN survey_windows sw ON sw.id = er.survey_window_id WHERE er.class_id = ?1 AND datetime(sw.opens_at) >= ?2`)
    .bind(classId, syStartParam)
    .first<{ avg_c: number | null; avg_l: number | null; cnt: number }>();
  const syMi = await db
    .prepare(`SELECT AVG(mr.connection) as avg_c, AVG(mr.contribution) as avg_l, COUNT(*) as cnt FROM mattering_responses mr JOIN survey_windows sw ON sw.id = mr.survey_window_id WHERE mr.class_id = ?1 AND datetime(sw.opens_at) >= ?2`)
    .bind(classId, syStartParam)
    .first<{ avg_c: number | null; avg_l: number | null; cnt: number }>();
  const syEiPoints = await db
    .prepare(`SELECT er.challenge, er.love FROM engagement_responses er JOIN survey_windows sw ON sw.id = er.survey_window_id WHERE er.class_id = ?1 AND datetime(sw.opens_at) >= ?2`)
    .bind(classId, syStartParam)
    .all<{ challenge: number; love: number }>();

  // Lifetime across ALL teachers for same course name
  const lifetimeEi = await db
    .prepare(
      `SELECT AVG(er.challenge) as avg_c, AVG(er.love) as avg_l, COUNT(*) as ei_cnt, COUNT(DISTINCT er.survey_window_id) as win_cnt
       FROM engagement_responses er
       JOIN classes c ON c.id = er.class_id
       WHERE c.name = ?1`
    )
    .bind(cls.name)
    .first<{ avg_c: number | null; avg_l: number | null; ei_cnt: number; win_cnt: number }>();
  const lifetimeMi = await db
    .prepare(
      `SELECT AVG(mr.connection) as avg_c, AVG(mr.contribution) as avg_l, COUNT(*) as ei_cnt, COUNT(DISTINCT mr.survey_window_id) as win_cnt
       FROM mattering_responses mr
       JOIN classes c ON c.id = mr.class_id
       WHERE c.name = ?1`
    )
    .bind(cls.name)
    .first<{ avg_c: number | null; avg_l: number | null; ei_cnt: number; win_cnt: number }>();
  const lifetimeEiPoints = await db
    .prepare(`SELECT er.challenge, er.love FROM engagement_responses er JOIN classes c ON c.id = er.class_id WHERE c.name = ?1`)
    .bind(cls.name)
    .all<{ challenge: number; love: number }>();

  const lifetimeClassCount = await db
    .prepare(`SELECT COUNT(DISTINCT id) as cnt FROM classes WHERE name = ?1`)
    .bind(cls.name)
    .first<{ cnt: number }>();

  const totalStudentCount = await db
    .prepare(`SELECT COUNT(DISTINCT e.student_id) as cnt FROM enrollments e JOIN classes c ON c.id = e.class_id WHERE c.name = ?1`)
    .bind(cls.name)
    .first<{ cnt: number }>();

  return c.json({
    cls: { ...cls, studentCount: studentCountRow?.cnt ?? 0 },
    latest_window,
    school_year: {
      ei: syEi,
      mi: syMi,
      window_count: Math.max(syEiWinCount?.cnt ?? 0, syMiWinCount?.cnt ?? 0),
      ei_points: syEiPoints.results ?? [],
    },
    lifetime_course: {
      ei: lifetimeEi,
      mi: lifetimeMi,
      class_count: lifetimeClassCount?.cnt ?? 0,
      total_student_count: totalStudentCount?.cnt ?? 0,
      ei_points: lifetimeEiPoints.results ?? [],
    },
  });
});

// ─── Student History ──────────────────────────────────────────────────────────

app.get("/api/student/history", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const [eiRows, miRows, dimRows] = await Promise.all([
    db.prepare(
      `SELECT er.class_id, er.challenge, er.love, er.submitted_at, er.class_name, er.teacher_name,
              sw.id as window_id, sw.name as window_name, sw.opens_at, sw.type
       FROM engagement_responses er
       JOIN survey_windows sw ON sw.id = er.survey_window_id
       WHERE er.student_id = ?1 ORDER BY sw.opens_at DESC`
    ).bind(user.id).all<{
      class_id: string; challenge: number; love: number; submitted_at: string;
      class_name: string | null; teacher_name: string | null;
      window_id: string; window_name: string; opens_at: string; type: string;
    }>(),
    db.prepare(
      `SELECT mr.class_id, mr.connection, mr.contribution, mr.submitted_at, mr.class_name, mr.teacher_name,
              sw.id as window_id, sw.name as window_name, sw.opens_at, sw.type
       FROM mattering_responses mr
       JOIN survey_windows sw ON sw.id = mr.survey_window_id
       WHERE mr.student_id = ?1 ORDER BY sw.opens_at DESC`
    ).bind(user.id).all<{
      class_id: string; connection: number; contribution: number; submitted_at: string;
      class_name: string | null; teacher_name: string | null;
      window_id: string; window_name: string; opens_at: string; type: string;
    }>(),
    db.prepare(
      `SELECT dr.class_id, dr.submitted_at, dr.class_name, dr.teacher_name,
              dr.behavioral_effort, dr.behavioral_focus, dr.behavioral_respect,
              dr.cognitive_clarity, dr.cognitive_expectations, dr.cognitive_feedback, dr.cognitive_challenge,
              dr.emotional_known, dr.emotional_cared, dr.emotional_motivated, dr.emotional_enjoyment,
              dr.instructional_activities, dr.instructional_collaboration, dr.instructional_assignments,
              sw.id as window_id, sw.name as window_name, sw.opens_at, sw.type
       FROM dimension_responses dr
       JOIN survey_windows sw ON sw.id = dr.survey_window_id
       WHERE dr.student_id = ?1 ORDER BY sw.opens_at DESC`
    ).bind(user.id).all<Record<string, unknown>>(),
  ]);

  // Get class fallback info for null snapshots
  const allClassIds = new Set<string>();
  for (const r of eiRows.results) allClassIds.add(r.class_id);
  for (const r of miRows.results) allClassIds.add(r.class_id);
  for (const r of (dimRows.results as Record<string, unknown>[])) allClassIds.add(r.class_id as string);

  const classInfoMap = new Map<string, { name: string; primary_teacher_name: string | null; subject: string | null }>();
  for (const classId of allClassIds) {
    const info = await db
      .prepare(`SELECT name, primary_teacher_name, subject FROM classes WHERE id = ?1`)
      .bind(classId)
      .first<{ name: string; primary_teacher_name: string | null; subject: string | null }>();
    if (info) classInfoMap.set(classId, info);
  }

  // Group by class_id
  type HistoryEntry = Record<string, unknown> & { type: string; opens_at: string };
  const byClass = new Map<string, { class_id: string; class_name: string; teacher_name: string | null; subject: string | null; responses: HistoryEntry[]; latest_at: string }>();

  function getOrCreate(classId: string, classNameSnap: string | null, teacherNameSnap: string | null) {
    if (!byClass.has(classId)) {
      const fallback = classInfoMap.get(classId);
      byClass.set(classId, {
        class_id: classId,
        class_name: classNameSnap ?? fallback?.name ?? classId,
        teacher_name: teacherNameSnap ?? fallback?.primary_teacher_name ?? null,
        subject: fallback?.subject ?? null,
        responses: [],
        latest_at: "",
      });
    }
    return byClass.get(classId)!;
  }

  for (const r of eiRows.results) {
    const entry = getOrCreate(r.class_id, r.class_name, r.teacher_name);
    entry.responses.push({ ...r, type: "engagement_index" } as HistoryEntry);
    if (!entry.latest_at || r.opens_at > entry.latest_at) entry.latest_at = r.opens_at;
  }
  for (const r of miRows.results) {
    const entry = getOrCreate(r.class_id, r.class_name, r.teacher_name);
    entry.responses.push({ ...r, type: "mattering_index" } as HistoryEntry);
    if (!entry.latest_at || r.opens_at > entry.latest_at) entry.latest_at = r.opens_at;
  }
  for (const r of (dimRows.results as (Record<string, unknown> & { class_id: string; class_name: string | null; teacher_name: string | null; opens_at: string })[]) ) {
    const entry = getOrCreate(r.class_id, r.class_name, r.teacher_name);
    entry.responses.push({ ...r, type: "dimensions" } as HistoryEntry);
    if (!entry.latest_at || r.opens_at > entry.latest_at) entry.latest_at = r.opens_at;
  }

  // Sort responses within each class
  for (const entry of byClass.values()) {
    entry.responses.sort((a, b) => String(b.opens_at ?? "").localeCompare(String(a.opens_at ?? "")));
  }

  const result = Array.from(byClass.values()).sort((a, b) => b.latest_at.localeCompare(a.latest_at));
  return c.json(result);
});

// ─── Student Response View ────────────────────────────────────────────────────

app.get("/api/student/responses/:windowId/:classId", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { windowId, classId } = c.req.param();

  const win = await db
    .prepare(`SELECT id, name, type, opens_at, closes_at FROM survey_windows WHERE id = ?1`)
    .bind(windowId)
    .first<{ id: string; name: string; type: string; opens_at: string; closes_at: string }>();
  if (!win) return c.json({ error: "Not found" }, 404);

  const cls = await db
    .prepare(`SELECT id, name, subject, grade_level FROM classes WHERE id = ?1`)
    .bind(classId)
    .first<{ id: string; name: string; subject: string | null; grade_level: string | null }>();

  // Try EI
  const eiResp = await db
    .prepare(`SELECT challenge, love, submitted_at, class_name, teacher_name FROM engagement_responses WHERE student_id = ?1 AND class_id = ?2 AND survey_window_id = ?3`)
    .bind(user.id, classId, windowId)
    .first<{ challenge: number; love: number; submitted_at: string; class_name: string | null; teacher_name: string | null }>();
  if (eiResp) return c.json({ type: "engagement_index", window: win, class: cls, response: eiResp });

  // Try MI
  const miResp = await db
    .prepare(`SELECT connection, contribution, submitted_at, class_name, teacher_name FROM mattering_responses WHERE student_id = ?1 AND class_id = ?2 AND survey_window_id = ?3`)
    .bind(user.id, classId, windowId)
    .first<{ connection: number; contribution: number; submitted_at: string; class_name: string | null; teacher_name: string | null }>();
  if (miResp) return c.json({ type: "mattering_index", window: win, class: cls, response: miResp });

  // Try dimensions
  const dimResp = await db
    .prepare(
      `SELECT behavioral_effort, behavioral_focus, behavioral_respect,
              cognitive_clarity, cognitive_expectations, cognitive_feedback, cognitive_challenge,
              emotional_known, emotional_cared, emotional_motivated, emotional_enjoyment,
              instructional_activities, instructional_collaboration, instructional_assignments,
              behavioral_comments, cognitive_comments, emotional_comments, instructional_comments,
              submitted_at, class_name, teacher_name
       FROM dimension_responses WHERE student_id = ?1 AND class_id = ?2 AND survey_window_id = ?3`
    )
    .bind(user.id, classId, windowId)
    .first();
  if (dimResp) return c.json({ type: "dimensions", window: win, class: cls, response: dimResp });

  return c.json({ error: "No response found" }, 404);
});

app.get("/api/admin/debug/vc", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);
  const path = c.req.query("path");
  if (!path) return c.json({ error: "Missing ?path= query param" }, 400);
  const result = await debugVeracrossEndpoint(path);
  return c.json(result);
});

app.post("/api/admin/sync", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  // Expire any running entries older than 5 minutes (they timed out)
  await db
    .prepare(`UPDATE sync_logs SET status='error', error_message='Timed out' WHERE status='running' AND ran_at < datetime('now', '-5 minutes')`)
    .run();

  // Prevent concurrent syncs
  const alreadyRunning = await db
    .prepare(`SELECT id FROM sync_logs WHERE status = 'running' LIMIT 1`)
    .first<{ id: string }>();
  if (alreadyRunning) return c.json({ error: "Sync already in progress" }, 409);

  const body = await c.req.json<{ phases?: SyncPhase[] }>().catch(() => ({}));
  const allPhases: SyncPhase[] = ["teachers", "students", "enrollments"];
  const requested = (body.phases ?? allPhases).filter((p): p is SyncPhase => allPhases.includes(p));
  if (requested.length === 0) return c.json({ error: "No phases selected" }, 400);

  const logId = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO sync_logs (id, status, phases) VALUES (?1, 'running', ?2)`)
    .bind(logId, JSON.stringify(requested))
    .run();

  await startSyncWorkflow(logId, requested);

  return c.json({ ok: true });
});

app.post("/api/admin/sync/cancel", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);
  await db
    .prepare(`UPDATE sync_logs SET status='error', error_message='Cancelled by admin' WHERE status='running'`)
    .run();
  return c.json({ ok: true });
});

app.get("/api/admin/sync/logs", async (c) => {
  const user = await getSessionUser(c);
  if (!user || user.role !== "admin") return c.json({ error: "Forbidden" }, 403);
  const logs = await db.prepare(
    `SELECT id, ran_at, status, students, teachers, classes, enrollments, teacher_assignments, error_message, duration_ms, phases
     FROM sync_logs ORDER BY ran_at DESC LIMIT 20`
  ).all<{ id: string; ran_at: string; status: string; students: number; teachers: number; classes: number; enrollments: number; teacher_assignments: number; error_message: string | null; duration_ms: number; phases: string | null }>();
  return c.json(logs.results ?? []);
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
