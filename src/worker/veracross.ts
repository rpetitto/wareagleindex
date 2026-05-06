import { db, secrets } from "flingit";

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
  primary_teacher?: {
    id: number;
    first_name: string;
    last_name: string;
    preferred_name?: string | null;
  } | null;
}

interface VCPhoto {
  id: number;
  person_id: number;
  download_url: string;
}

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
      scope: "students:list staff_faculty:list academics.enrollments:list person_photos:list",
    }),
  });

  if (!res.ok) throw new Error(`Veracross token error: ${res.status}`);
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(`Veracross auth failed: ${data.error ?? "no token"}`);
  return data.access_token;
}

async function vcGet<T>(base: string, path: string, token: string, maxPages = 10): Promise<T[]> {
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

// Execute prepared statements in batches to avoid D1 per-request limits
async function batchRun(stmts: ReturnType<typeof db.prepare>[], size = 100) {
  for (let i = 0; i < stmts.length; i += size) {
    await db.batch(stmts.slice(i, i + size));
  }
}

export interface SyncResult {
  students: number;
  teachers: number;
  classes: number;
  enrollments: number;
  teacherAssignments: number;
}

export async function syncVeracross(): Promise<SyncResult> {
  const school = secrets.get("VERACROSS_SCHOOL");
  const base = `https://api.veracross.com/${school}/v3`;
  const token = await getVCToken();

  // ── 1. Photos ─────────────────────────────────────────────────────────────
  const photos = await vcGet<VCPhoto>(base, "person_photos", token);
  const photoByPersonId = new Map<number, string>();
  for (const p of photos) photoByPersonId.set(p.person_id, p.download_url);

  // ── 2. Faculty — batch upsert ─────────────────────────────────────────────
  const allStaff = await vcGet<VCStaff>(base, "staff_faculty", token);
  const faculty = allStaff.filter((s) => (s.roles ?? "").includes("Faculty"));

  const facultyStmts = faculty.flatMap((f) => {
    const email = (f.email_1 || f.username || "").toLowerCase().trim();
    if (!email) return [];
    const name = f.preferred_name
      ? `${f.preferred_name} ${f.last_name}`.trim()
      : `${f.first_name} ${f.last_name}`.trim();
    const vcId = String(f.id);
    const photo = photoByPersonId.get(f.id) ?? null;
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
  await batchRun(facultyStmts);

  // ── 3. Students — batch upsert ────────────────────────────────────────────
  const students = await vcGet<VCStudent>(base, "students", token);

  const studentStmts = students.flatMap((s) => {
    const email = (s.email_1 || s.username || "").toLowerCase().trim();
    if (!email) return [];
    const name = s.preferred_name
      ? `${s.preferred_name} ${s.last_name}`.trim()
      : `${s.first_name} ${s.last_name}`.trim();
    const vcId = String(s.id);
    const photo = photoByPersonId.get(s.id) ?? null;
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
  await batchRun(studentStmts);

  // ── 4. All enrollments in one paginated request ───────────────────────────
  const allEnrollments = await vcGet<VCEnrollment>(
    base,
    "academics/enrollments?currently_enrolled=true",
    token,
    1  // one page of 1000 is sufficient; avoids slow multi-page iteration on this endpoint
  );
  const activeEnrollments = allEnrollments.filter(
    (e) =>
      e.currently_enrolled &&
      e.exclude_from_transcript !== true &&
      String(e.class_status).toLowerCase() !== "future"
  );

  // ── 5. Collect unique classes ─────────────────────────────────────────────
  interface ClassInfo {
    vcId: string;
    name: string;
    gradeLevel: string | null;
    teacherVcId: string | null;
    teacherName: string | null;
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
    classMap.set(e.internal_class_id, {
      vcId: String(e.internal_class_id),
      name: e.class_description,
      gradeLevel: e.grade_level_id != null ? String(e.grade_level_id) : null,
      teacherVcId,
      teacherName,
    });
  }

  // ── 6. Batch upsert classes ───────────────────────────────────────────────
  const classStmts = [...classMap.values()].map((cls) =>
    db.prepare(
      `INSERT INTO classes (id, veracross_id, name, grade_level, primary_teacher_vc_id, primary_teacher_name)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(veracross_id) DO UPDATE SET
         name = excluded.name,
         grade_level = excluded.grade_level,
         primary_teacher_vc_id = excluded.primary_teacher_vc_id,
         primary_teacher_name = excluded.primary_teacher_name`
    ).bind(crypto.randomUUID(), cls.vcId, cls.name, cls.gradeLevel, cls.teacherVcId, cls.teacherName)
  );
  await batchRun(classStmts);

  // ── 7. Build lookup maps ──────────────────────────────────────────────────
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

  // ── 8. Batch insert enrollment links ──────────────────────────────────────
  const enrollStmts: ReturnType<typeof db.prepare>[] = [];
  for (const e of activeEnrollments) {
    const studentUserId = userIdByVcId.get(String(e.person_id));
    const classId = classIdByVcId.get(String(e.internal_class_id));
    if (!studentUserId || !classId) continue;
    enrollStmts.push(
      db.prepare(`INSERT OR IGNORE INTO enrollments (id, student_id, class_id) VALUES (?1, ?2, ?3)`)
        .bind(crypto.randomUUID(), studentUserId, classId)
    );
  }
  await batchRun(enrollStmts);

  // ── 9. Batch link teachers to classes ─────────────────────────────────────
  const teacherLinks = await db
    .prepare(
      `SELECT c.id AS class_id, u.id AS teacher_id
       FROM classes c
       JOIN users u ON u.veracross_id = c.primary_teacher_vc_id
       WHERE u.role IN ('teacher', 'admin') AND c.primary_teacher_vc_id IS NOT NULL`
    )
    .all<{ class_id: string; teacher_id: string }>();

  const teacherStmts = (teacherLinks.results ?? []).map((link) =>
    db.prepare(`INSERT OR IGNORE INTO teacher_classes (id, teacher_id, class_id) VALUES (?1, ?2, ?3)`)
      .bind(crypto.randomUUID(), link.teacher_id, link.class_id)
  );
  await batchRun(teacherStmts);

  return {
    students: students.length,
    teachers: faculty.length,
    classes: classMap.size,
    enrollments: enrollStmts.length,
    teacherAssignments: teacherStmts.length,
  };
}
