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
  roles?: string | null; // e.g. "Faculty", "Staff", "Coach, Faculty"
  job_title?: string | null;
  faculty_type?: number | null;
}

interface VCEnrollment {
  id: number;
  internal_class_id: number;
  class_description: string;
  class_status: number;
  currently_enrolled: boolean;
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

async function vcGet<T>(base: string, path: string, token: string): Promise<T[]> {
  const PAGE_SIZE = 100;
  const headers = { Authorization: `Bearer ${token}` };

  // Try first page with pagination params; if the endpoint rejects them (400),
  // fall back to a plain fetch and return whatever the API gives us.
  const separator = path.includes("?") ? "&" : "?";
  const firstUrl = `${base}/${path}${separator}page[size]=${PAGE_SIZE}&page[number]=1`;
  const firstRes = await fetch(firstUrl, { headers });

  if (firstRes.status === 400) {
    // Endpoint doesn't support pagination params — fetch without them
    const res = await fetch(`${base}/${path}`, { headers });
    if (!res.ok) throw new Error(`Veracross API ${res.status}: /${path}`);
    const json = (await res.json()) as { data?: T[]; error?: string };
    if (json.error) throw new Error(`Veracross /${path}: ${json.error}`);
    return json.data ?? [];
  }

  if (!firstRes.ok) throw new Error(`Veracross API ${firstRes.status}: /${path}`);
  const firstJson = (await firstRes.json()) as { data?: T[]; error?: string };
  if (firstJson.error) throw new Error(`Veracross /${path}: ${firstJson.error}`);

  const all: T[] = [...(firstJson.data ?? [])];
  if (all.length < PAGE_SIZE) return all;

  // Keep paging until we get a partial page
  let page = 2;
  while (true) {
    const url = `${base}/${path}${separator}page[size]=${PAGE_SIZE}&page[number]=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok || res.status === 400) break;
    const json = (await res.json()) as { data?: T[]; error?: string };
    const records = json.data ?? [];
    all.push(...records);
    if (records.length < PAGE_SIZE) break;
    page++;
  }

  return all;
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

  // ── 1. Sync person photos (build a map for enriching profiles) ────────────
  const photos = await vcGet<VCPhoto>(base, "person_photos", token);
  const photoByPersonId = new Map<number, string>();
  for (const p of photos) {
    photoByPersonId.set(p.person_id, p.download_url);
  }

  // ── 2. Sync faculty (teachers) — do this BEFORE enrollments so teacher- ───
  //       class linking works when we iterate through enrollments.           ──
  const allStaff = await vcGet<VCStaff>(base, "staff_faculty", token);
  const faculty = allStaff.filter((s) => (s.roles ?? "").includes("Faculty"));

  for (const f of faculty) {
    const email = (f.email_1 || f.username || "").toLowerCase().trim();
    if (!email) continue;

    const name = f.preferred_name
      ? `${f.preferred_name} ${f.last_name}`.trim()
      : `${f.first_name} ${f.last_name}`.trim();
    const vcId = String(f.id);
    const photo = photoByPersonId.get(f.id) ?? null;

    await db
      .prepare(
        `INSERT INTO users (id, google_id, email, name, role, veracross_id, picture)
         VALUES (?1, ?2, ?3, ?4, 'teacher', ?5, ?6)
         ON CONFLICT(email) DO UPDATE SET
           name = excluded.name,
           veracross_id = excluded.veracross_id,
           role = CASE WHEN role = 'admin' THEN 'admin' ELSE 'teacher' END,
           picture = COALESCE(CASE WHEN picture LIKE '%google%' OR picture LIKE '%googleapis%' THEN picture ELSE excluded.picture END, picture),
           updated_at = datetime('now')`
      )
      .bind(crypto.randomUUID(), `vc_teacher_${vcId}`, email, name, vcId, photo)
      .run();
  }

  // ── 3. Sync students ──────────────────────────────────────────────────────
  const students = await vcGet<VCStudent>(base, "students", token);
  const studentEmailById = new Map<number, string>();

  for (const s of students) {
    const email = (s.email_1 || s.username || "").toLowerCase().trim();
    if (!email) continue;

    const name = s.preferred_name
      ? `${s.preferred_name} ${s.last_name}`.trim()
      : `${s.first_name} ${s.last_name}`.trim();
    const vcId = String(s.id);
    const photo = photoByPersonId.get(s.id) ?? null;

    await db
      .prepare(
        `INSERT INTO users (id, google_id, email, name, role, veracross_id, picture)
         VALUES (?1, ?2, ?3, ?4, 'student', ?5, ?6)
         ON CONFLICT(email) DO UPDATE SET
           name = excluded.name,
           veracross_id = excluded.veracross_id,
           picture = COALESCE(CASE WHEN picture LIKE '%google%' OR picture LIKE '%googleapis%' THEN picture ELSE excluded.picture END, picture),
           updated_at = datetime('now')
         WHERE role != 'admin'`
      )
      .bind(crypto.randomUUID(), `vc_${vcId}`, email, name, vcId, photo)
      .run();

    studentEmailById.set(s.id, email);
  }

  // ── 4. For each student, fetch their real enrollments ────────────────────
  let enrollCount = 0;
  let classCount = 0;
  let teacherCount = 0;
  const processedClassIds = new Set<number>();

  for (const s of students) {
    const studentEmail = studentEmailById.get(s.id);
    if (!studentEmail) continue;

    const studentUser = await db
      .prepare(`SELECT id FROM users WHERE email = ?1`)
      .bind(studentEmail)
      .first<{ id: string }>();
    if (!studentUser) continue;

    const enrollments = await vcGet<VCEnrollment>(
      base,
      `academics/enrollments?person_id=${s.id}`,
      token
    );

    for (const enroll of enrollments) {
      if (!enroll.currently_enrolled) continue;

      const classVcId = String(enroll.internal_class_id);

      // Upsert class (built from enrollment data which includes teacher info)
      if (!processedClassIds.has(enroll.internal_class_id)) {
        processedClassIds.add(enroll.internal_class_id);

        const teacherVcId = enroll.primary_teacher?.id
          ? String(enroll.primary_teacher.id)
          : null;
        const teacherDisplayName = enroll.primary_teacher
          ? (
              (enroll.primary_teacher.preferred_name?.trim() || enroll.primary_teacher.first_name?.trim()) +
              " " +
              enroll.primary_teacher.last_name?.trim()
            ).trim()
          : null;

        await db
          .prepare(
            `INSERT INTO classes (id, veracross_id, name, grade_level, primary_teacher_vc_id, primary_teacher_name)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(veracross_id) DO UPDATE SET
               name = excluded.name,
               grade_level = excluded.grade_level,
               primary_teacher_vc_id = excluded.primary_teacher_vc_id,
               primary_teacher_name = excluded.primary_teacher_name`
          )
          .bind(
            crypto.randomUUID(),
            classVcId,
            enroll.class_description,
            enroll.grade_level_id != null ? String(enroll.grade_level_id) : null,
            teacherVcId,
            teacherDisplayName
          )
          .run();

        classCount++;

        // Link teacher to class if their account exists
        if (teacherVcId) {
          const teacher = await db
            .prepare(
              `SELECT id FROM users WHERE veracross_id = ?1 AND (role = 'teacher' OR role = 'admin')`
            )
            .bind(teacherVcId)
            .first<{ id: string }>();

          if (teacher) {
            const classRecord = await db
              .prepare(`SELECT id FROM classes WHERE veracross_id = ?1`)
              .bind(classVcId)
              .first<{ id: string }>();

            if (classRecord) {
              await db
                .prepare(
                  `INSERT OR IGNORE INTO teacher_classes (id, teacher_id, class_id) VALUES (?1, ?2, ?3)`
                )
                .bind(crypto.randomUUID(), teacher.id, classRecord.id)
                .run();
              teacherCount++;
            }
          }
        }
      }

      // Create enrollment link
      const classRecord = await db
        .prepare(`SELECT id FROM classes WHERE veracross_id = ?1`)
        .bind(classVcId)
        .first<{ id: string }>();

      if (classRecord) {
        await db
          .prepare(
            `INSERT OR IGNORE INTO enrollments (id, student_id, class_id) VALUES (?1, ?2, ?3)`
          )
          .bind(crypto.randomUUID(), studentUser.id, classRecord.id)
          .run();
        enrollCount++;
      }
    }
  }

  return {
    students: students.length,
    teachers: faculty.length,
    classes: classCount,
    enrollments: enrollCount,
    teacherAssignments: teacherCount,
  };
}
