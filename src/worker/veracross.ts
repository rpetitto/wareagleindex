import { db, secrets, workflow, type WorkflowContinuation, type WorkflowCtx } from "flingit";

interface VCStudent {
  id: number;
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
  email_1?: string | null;
  username?: string | null;
  grade_level: number;
  school_level: number;
}

interface VCStaff {
  id: number;
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
  email_1?: string | null;
  username?: string | null;
  roles?: string | null;
  job_title?: string | null;
  faculty_type?: number | null;
}

interface VCEnrollment {
  id: number;
  internal_class_id: number;
  class_description: string;
  class_status: string | number | null;
  currently_enrolled: boolean;
  exclude_from_transcript?: boolean | null;
  grade_level_id: number;
  person_id: number;
  date_withdrawn?: string | null;
  course_type?: number | null;
  primary_teacher?: {
    id: number;
    first_name: string;
    last_name: string;
    preferred_name?: string | null;
  } | null;
}

// Patterns identifying non-academic classes that shouldn't be surveyed.
// Matched (case-insensitive) against class_description; tweak as needed.
const NON_ACADEMIC_PATTERNS: RegExp[] = [
  /\bhomeroom\b/i,
  /\badvisory\b/i,
  /\br[-\s]?period\b/i,
  /\bstudy\s+hall\b/i,
  /\bfree\s+period\b/i,
  /\blunch\b/i,
  /\bchapel\b/i,
  /\bassembly\b/i,
  /\bactivity\s+period\b/i,
  /^class of \d+/i, // "Class of 2027", "Class of 2028", etc.
];

function isNonAcademic(name: string): boolean {
  return NON_ACADEMIC_PATTERNS.some((rx) => rx.test(name));
}

function isWithdrawn(dateWithdrawn: string | null | undefined): boolean {
  if (!dateWithdrawn) return false;
  const t = Date.parse(dateWithdrawn);
  if (isNaN(t)) return false;
  return t < Date.now();
}

interface VCPhoto {
  id: number;
  person_id: number;
  download_url: string;
}

interface VCClassSchedule {
  id: number;
  internal_class_id: number;
  class_id: string;
  school_year: number;
  grading_period?: { id: number; description: string; abbreviation: string } | null;
}

interface VCGradingPeriod {
  id: number;
  description: string;
  abbreviation: string;
  start_date: string | null;
  end_date: string | null;
  school_year: number;
}

export type SyncPhase = "teachers" | "students" | "enrollments";
const PHASE_ORDER: SyncPhase[] = ["teachers", "students", "enrollments"];

async function getVCToken(): Promise<string> {
  const school = secrets.get("VERACROSS_SCHOOL");
  const clientId = secrets.get("VERACROSS_CLIENT_ID");
  const clientSecret = secrets.get("VERACROSS_CLIENT_SECRET");

  const res = await fetch(`https://accounts.veracross.com/${school}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "students:list staff_faculty:list academics.enrollments:list academics.class_schedules:list academics.config.grading_periods:list person_photos:list",
    }),
  });

  if (!res.ok) throw new Error(`Veracross token error: ${res.status}`);
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(`Veracross auth failed: ${data.error ?? "no token"}`);
  return data.access_token;
}

async function vcGet<T>(base: string, path: string, token: string, maxPages = 20): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const all: T[] = [];
  let page = 1;

  while (page <= maxPages) {
    const res = await fetch(`${base}/${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Page-Size": String(PAGE_SIZE),
        "X-Page-Number": String(page),
      },
    });
    if (!res.ok) throw new Error(`Veracross API ${res.status}: /${path}`);
    const json = (await res.json()) as { data?: T[]; error?: string };
    if (json.error) throw new Error(`Veracross /${path}: ${json.error}`);
    const records = json.data ?? [];
    all.push(...records);
    if (records.length < PAGE_SIZE) break;
    page++;
  }

  return all;
}

async function batchRun(stmts: ReturnType<typeof db.prepare>[], size = 100) {
  for (let i = 0; i < stmts.length; i += size) {
    await db.batch(stmts.slice(i, i + size));
  }
}

function getBase() {
  const school = secrets.get("VERACROSS_SCHOOL");
  return `https://api.veracross.com/${school}/v3`;
}

// Veracross "school_year" is the year the school year STARTS in.
// e.g. the 2025-2026 academic year = school_year 2025.
// School years start in August (month 7), so Jan-Jul are still the previous start-year.
function currentSchoolYear(): number {
  const now = new Date();
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 7 ? year : year - 1;
}

async function loadPhotoMap(base: string, token: string): Promise<Map<number, string>> {
  const photos = await vcGet<VCPhoto>(base, "person_photos", token);
  const map = new Map<number, string>();
  for (const p of photos) map.set(p.person_id, p.download_url);
  return map;
}

// Determine which step to run next based on requested phases
function nextStep(phases: SyncPhase[], completed: SyncPhase | null): WorkflowContinuation {
  const startIdx = completed ? PHASE_ORDER.indexOf(completed) + 1 : 0;
  for (let i = startIdx; i < PHASE_ORDER.length; i++) {
    if (phases.includes(PHASE_ORDER[i])) {
      return { step: `sync_${PHASE_ORDER[i]}` };
    }
  }
  return { step: "finalize" };
}

// ── Workflow ──────────────────────────────────────────────────────────────────

workflow("veracross-sync", {
  async start(ctx: WorkflowCtx): Promise<WorkflowContinuation> {
    ctx.set("startTime", Date.now());
    const phases = (await ctx.get("phases")) as SyncPhase[];
    const logId = (await ctx.get("logId")) as string;

    // Persist phases on the log so the UI can show progress per phase
    await db
      .prepare(`UPDATE sync_logs SET phases=?1 WHERE id=?2`)
      .bind(JSON.stringify(phases), logId)
      .run();

    return nextStep(phases, null);
  },

  async sync_teachers(ctx: WorkflowCtx): Promise<WorkflowContinuation> {
    const base = getBase();
    const token = await getVCToken();
    const photoMap = await loadPhotoMap(base, token);

    const allStaff = await vcGet<VCStaff>(base, "staff_faculty", token);
    const faculty = allStaff.filter((s) => (s.roles ?? "").includes("Faculty"));

    const stmts = faculty.flatMap((f) => {
      const email = (f.email_1 || f.username || "").toLowerCase().trim();
      if (!email) return [];
      const name = f.preferred_name
        ? `${f.preferred_name} ${f.last_name}`.trim()
        : `${f.first_name} ${f.last_name}`.trim();
      const vcId = String(f.id);
      const photo = photoMap.get(f.id) ?? null;
      return [
        db.prepare(
          `INSERT INTO users (id, google_id, email, name, role, veracross_id, picture)
           VALUES (?1, ?2, ?3, ?4, 'teacher', ?5, ?6)
           ON CONFLICT(email) DO UPDATE SET
             name = excluded.name,
             veracross_id = excluded.veracross_id,
             role = CASE WHEN role = 'admin' THEN 'admin' ELSE 'teacher' END,
             picture = COALESCE(CASE WHEN picture LIKE '%google%' OR picture LIKE '%googleapis%' THEN picture ELSE excluded.picture END, picture),
             updated_at = datetime('now')`
        ).bind(crypto.randomUUID(), `vc_teacher_${vcId}`, email, name, vcId, photo),
      ];
    });
    await batchRun(stmts);

    const logId = (await ctx.get("logId")) as string;
    await db.prepare(`UPDATE sync_logs SET teachers=?1 WHERE id=?2`).bind(faculty.length, logId).run();

    return nextStep((await ctx.get("phases")) as SyncPhase[], "teachers");
  },

  async sync_students(ctx: WorkflowCtx): Promise<WorkflowContinuation> {
    const base = getBase();
    const token = await getVCToken();
    const photoMap = await loadPhotoMap(base, token);

    const students = await vcGet<VCStudent>(base, "students", token);

    const stmts = students.flatMap((s) => {
      const email = (s.email_1 || s.username || "").toLowerCase().trim();
      if (!email) return [];
      const name = s.preferred_name
        ? `${s.preferred_name} ${s.last_name}`.trim()
        : `${s.first_name} ${s.last_name}`.trim();
      const vcId = String(s.id);
      const photo = photoMap.get(s.id) ?? null;
      return [
        db.prepare(
          `INSERT INTO users (id, google_id, email, name, role, veracross_id, picture)
           VALUES (?1, ?2, ?3, ?4, 'student', ?5, ?6)
           ON CONFLICT(email) DO UPDATE SET
             name = excluded.name,
             veracross_id = excluded.veracross_id,
             picture = COALESCE(CASE WHEN picture LIKE '%google%' OR picture LIKE '%googleapis%' THEN picture ELSE excluded.picture END, picture),
             updated_at = datetime('now')
           WHERE role != 'admin'`
        ).bind(crypto.randomUUID(), `vc_${vcId}`, email, name, vcId, photo),
      ];
    });
    await batchRun(stmts);

    const logId = (await ctx.get("logId")) as string;
    await db.prepare(`UPDATE sync_logs SET students=?1 WHERE id=?2`).bind(students.length, logId).run();

    return nextStep((await ctx.get("phases")) as SyncPhase[], "students");
  },

  async sync_enrollments(ctx: WorkflowCtx): Promise<WorkflowContinuation> {
    const base = getBase();
    const token = await getVCToken();
    const syncStamp = new Date().toISOString();

    // class_schedules is the authoritative list of classes that are actively
    // meeting. Any class with at least one schedule entry is "real" — past-term
    // and non-academic (homeroom, advisory, etc.) classes typically have no
    // schedule. We use this as an allowlist of internal_class_id values.
    //
    // Filter by school_year to keep the response size manageable; the endpoint
    // can otherwise return tens of thousands of rows across all years and
    // exhaust the worker's D1 budget. If the call fails or returns nothing,
    // skip the allowlist (fail-soft) — the regex filter still rejects most
    // non-academic classes.
    const schoolYear = currentSchoolYear();

    // Fetch grading periods so we know each period's date range.
    // Used to populate begin_date/end_date on classes (fail-soft).
    const gpDates = new Map<number, { begin_date: string; end_date: string }>();
    try {
      const gps = await vcGet<VCGradingPeriod>(
        base,
        `academics/config/grading_periods?school_year=${schoolYear}`,
        token,
        1
      );
      for (const gp of gps) {
        if (gp.start_date && gp.end_date) {
          gpDates.set(gp.id, { begin_date: gp.start_date, end_date: gp.end_date });
        }
      }
      console.log(`grading_periods: ${gpDates.size} with dates for school_year=${schoolYear}`);
    } catch (err) {
      console.warn(`grading_periods fetch failed:`, err);
    }

    // class_schedules: used only to extract grading period date ranges per class.
    // NOT used as an enrollment allowlist — PE/electives often have no scheduled
    // block and would be incorrectly excluded. currently_enrolled=true + regex
    // filters are sufficient gatekeeping.
    const classDateRange = new Map<number, { begin_date: string; end_date: string }>();
    try {
      const schedules = await vcGet<VCClassSchedule>(base, `academics/class_schedules`, token, 20);
      console.log(`class_schedules: ${schedules.length} rows`);
      for (const s of schedules) {
        const gpId = s.grading_period?.id;
        if (gpId && gpDates.has(gpId)) {
          const { begin_date, end_date } = gpDates.get(gpId)!;
          const existing = classDateRange.get(s.internal_class_id);
          if (!existing) {
            classDateRange.set(s.internal_class_id, { begin_date, end_date });
          } else {
            classDateRange.set(s.internal_class_id, {
              begin_date: begin_date < existing.begin_date ? begin_date : existing.begin_date,
              end_date: end_date > existing.end_date ? end_date : existing.end_date,
            });
          }
        }
      }
      console.log(`class date ranges populated: ${classDateRange.size} classes`);
    } catch (err) {
      console.warn(`class_schedules fetch failed, skipping date ranges:`, err);
    }

    const allEnrollments = await vcGet<VCEnrollment>(
      base,
      `academics/enrollments?currently_enrolled=true`,
      token
    );

    // course_type 3 = Academic, 4 = Non-Academic (per Veracross standard types)
    const ALLOWED_COURSE_TYPES = new Set([3, 4]);
    const activeEnrollments = allEnrollments.filter(
      (e) =>
        e.currently_enrolled &&
        e.exclude_from_transcript !== true &&
        String(e.class_status).toLowerCase() !== "future" &&
        !isWithdrawn(e.date_withdrawn) &&
        !isNonAcademic(e.class_description ?? "") &&
        (e.course_type == null || ALLOWED_COURSE_TYPES.has(e.course_type))
    );

    interface ClassInfo {
      vcId: string;
      name: string;
      gradeLevel: string | null;
      teacherVcId: string | null;
      teacherName: string | null;
      beginDate: string | null;
      endDate: string | null;
    }
    const classMap = new Map<number, ClassInfo>();
    for (const e of activeEnrollments) {
      if (classMap.has(e.internal_class_id)) continue;
      const teacherVcId = e.primary_teacher?.id ? String(e.primary_teacher.id) : null;
      const teacherName = e.primary_teacher
        ? (
            (e.primary_teacher.preferred_name?.trim() || e.primary_teacher.first_name?.trim()) +
            " " +
            e.primary_teacher.last_name?.trim()
          ).trim()
        : null;
      const dates = classDateRange.get(e.internal_class_id);
      classMap.set(e.internal_class_id, {
        vcId: String(e.internal_class_id),
        name: e.class_description,
        gradeLevel: e.grade_level_id != null ? String(e.grade_level_id) : null,
        teacherVcId,
        teacherName,
        beginDate: dates?.begin_date ?? null,
        endDate: dates?.end_date ?? null,
      });
    }

    const classStmts = [...classMap.values()].map((cls) =>
      db.prepare(
        `INSERT INTO classes (id, veracross_id, name, grade_level, primary_teacher_vc_id, primary_teacher_name, begin_date, end_date)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(veracross_id) DO UPDATE SET
           name = excluded.name,
           grade_level = excluded.grade_level,
           primary_teacher_vc_id = excluded.primary_teacher_vc_id,
           primary_teacher_name = excluded.primary_teacher_name,
           begin_date = excluded.begin_date,
           end_date = excluded.end_date`
      ).bind(crypto.randomUUID(), cls.vcId, cls.name, cls.gradeLevel, cls.teacherVcId, cls.teacherName, cls.beginDate, cls.endDate)
    );
    await batchRun(classStmts);

    const userRows = await db
      .prepare(`SELECT id, veracross_id FROM users WHERE veracross_id IS NOT NULL`)
      .all<{ id: string; veracross_id: string }>();
    const userIdByVcId = new Map<string, string>();
    for (const u of userRows.results ?? []) userIdByVcId.set(u.veracross_id, u.id);

    const classRows = await db
      .prepare(`SELECT id, veracross_id FROM classes WHERE veracross_id IS NOT NULL`)
      .all<{ id: string; veracross_id: string }>();
    const classIdByVcId = new Map<string, string>();
    for (const c of classRows.results ?? []) classIdByVcId.set(c.veracross_id, c.id);

    const enrollStmts: ReturnType<typeof db.prepare>[] = [];
    for (const e of activeEnrollments) {
      const studentUserId = userIdByVcId.get(String(e.person_id));
      const classId = classIdByVcId.get(String(e.internal_class_id));
      if (!studentUserId || !classId) continue;
      enrollStmts.push(
        db.prepare(
          `INSERT INTO enrollments (id, student_id, class_id, class_status, last_synced_at)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(student_id, class_id) DO UPDATE SET class_status = excluded.class_status, last_synced_at = excluded.last_synced_at`
        ).bind(crypto.randomUUID(), studentUserId, classId, e.class_status ?? null, syncStamp)
      );
    }
    await batchRun(enrollStmts);

    const teacherLinks = await db
      .prepare(
        `SELECT c.id AS class_id, u.id AS teacher_id
         FROM classes c
         JOIN users u ON u.veracross_id = c.primary_teacher_vc_id
         WHERE u.role IN ('teacher', 'admin') AND c.primary_teacher_vc_id IS NOT NULL`
      )
      .all<{ class_id: string; teacher_id: string }>();

    const teacherStmts = (teacherLinks.results ?? []).map((link) =>
      db.prepare(
        `INSERT INTO teacher_classes (id, teacher_id, class_id, last_synced_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(teacher_id, class_id) DO UPDATE SET last_synced_at = excluded.last_synced_at`
      ).bind(crypto.randomUUID(), link.teacher_id, link.class_id, syncStamp)
    );
    await batchRun(teacherStmts);

    // Drop stale rows that weren't seen in this sync.
    // Only do the cleanup if we actually synced something — protects against
    // an empty Veracross response wiping the DB.
    if (enrollStmts.length > 0) {
      await db
        .prepare(`DELETE FROM enrollments WHERE last_synced_at IS NULL OR last_synced_at < ?1`)
        .bind(syncStamp)
        .run();
    }
    if (teacherStmts.length > 0) {
      await db
        .prepare(`DELETE FROM teacher_classes WHERE last_synced_at IS NULL OR last_synced_at < ?1`)
        .bind(syncStamp)
        .run();
    }

    const logId = (await ctx.get("logId")) as string;
    await db
      .prepare(`UPDATE sync_logs SET classes=?1, enrollments=?2, teacher_assignments=?3 WHERE id=?4`)
      .bind(classMap.size, enrollStmts.length, teacherStmts.length, logId)
      .run();

    return nextStep((await ctx.get("phases")) as SyncPhase[], "enrollments");
  },

  async finalize(ctx: WorkflowCtx): Promise<WorkflowContinuation> {
    const logId = (await ctx.get("logId")) as string;
    const startTime = (await ctx.get("startTime")) as number;
    await db
      .prepare(`UPDATE sync_logs SET status='ok', duration_ms=?1 WHERE id=?2`)
      .bind(Date.now() - startTime, logId)
      .run();
    return { done: true, result: { ok: true } };
  },
}, { maxAttempts: 2 });

export async function startSyncWorkflow(logId: string, phases: SyncPhase[]): Promise<void> {
  await workflow.start("veracross-sync", { logId, phases });
}

// Diagnostic helper: hits a Veracross endpoint with current credentials and
// returns status + first record. Used by /api/admin/debug/vc.
export async function debugVeracrossEndpoint(path: string): Promise<{
  ok: boolean;
  status: number;
  schoolYear: number;
  count?: number;
  sample?: unknown;
  error?: string;
}> {
  const schoolYear = currentSchoolYear();
  try {
    const token = await getVCToken();
    const base = getBase();
    const res = await fetch(`${base}/${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Page-Size": "5",
        "X-Page-Number": "1",
      },
    });
    const bodyText = await res.text();
    let parsed: { data?: unknown[]; error?: string } | null = null;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      return { ok: false, status: res.status, schoolYear, error: bodyText.slice(0, 500) };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, schoolYear, error: parsed?.error ?? bodyText.slice(0, 500) };
    }
    return {
      ok: true,
      status: res.status,
      schoolYear,
      count: parsed?.data?.length ?? 0,
      sample: parsed?.data?.[0] ?? null,
    };
  } catch (err) {
    return { ok: false, status: 0, schoolYear, error: String(err) };
  }
}
