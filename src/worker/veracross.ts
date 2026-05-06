import { db, secrets } from "flingit";

interface VCPerson {
  id: string;
  attributes: {
    first_name: string;
    last_name: string;
    email_1?: string;
    school_email?: string;
    person_pk?: number;
  };
}

interface VCSection {
  id: string;
  attributes: {
    name?: string;
    section_name?: string;
    course_name?: string;
    grade_level_name?: string;
    school_year_name?: string;
    term_name?: string;
    section_pk?: number;
  };
}

interface VCEnrollment {
  id: string;
  attributes: {
    person_pk: number;
    section_pk: number;
    role?: string;
  };
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
      scope: "schools:read",
    }),
  });

  if (!res.ok) throw new Error(`Veracross token error: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function fetchAllPages<T>(
  baseUrl: string,
  token: string
): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = `${baseUrl}&page[size]=200&page[number]=1`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Veracross API error ${res.status}: ${url}`);
    const json = (await res.json()) as { data: T[]; links?: { next?: string } };
    results.push(...(json.data || []));
    url = json.links?.next || null;
  }

  return results;
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

  // Fetch students
  const students = await fetchAllPages<VCPerson>(
    `${base}/people?filter[type][]=Student`,
    token
  );

  // Fetch faculty
  const faculty = await fetchAllPages<VCPerson>(
    `${base}/people?filter[type][]=Faculty`,
    token
  );

  // Fetch sections
  const sections = await fetchAllPages<VCSection>(`${base}/sections?`, token);

  // Fetch section enrollments (students in sections)
  const enrollments = await fetchAllPages<VCEnrollment>(
    `${base}/section-enrollments?filter[role]=Student`,
    token
  );

  // Fetch section staff (teachers in sections)
  const sectionStaff = await fetchAllPages<VCEnrollment>(
    `${base}/section-staff?`,
    token
  );

  // Upsert students
  for (const s of students) {
    const email = s.attributes.school_email || s.attributes.email_1;
    if (!email) continue;
    const name = `${s.attributes.first_name} ${s.attributes.last_name}`.trim();
    const vcId = String(s.attributes.person_pk || s.id);

    await db
      .prepare(
        `INSERT INTO users (id, google_id, email, name, role, veracross_id)
         VALUES (?1, ?2, ?3, ?4, 'student', ?5)
         ON CONFLICT(email) DO UPDATE SET
           name = excluded.name,
           veracross_id = excluded.veracross_id,
           updated_at = datetime('now')
         WHERE role != 'admin'`
      )
      .bind(crypto.randomUUID(), `vc_${vcId}`, email.toLowerCase(), name, vcId)
      .run();
  }

  // Upsert faculty
  for (const f of faculty) {
    const email = f.attributes.school_email || f.attributes.email_1;
    if (!email) continue;
    const name = `${f.attributes.first_name} ${f.attributes.last_name}`.trim();
    const vcId = String(f.attributes.person_pk || f.id);

    await db
      .prepare(
        `INSERT INTO users (id, google_id, email, name, role, veracross_id)
         VALUES (?1, ?2, ?3, ?4, 'teacher', ?5)
         ON CONFLICT(email) DO UPDATE SET
           name = excluded.name,
           veracross_id = excluded.veracross_id,
           role = CASE WHEN role = 'admin' THEN 'admin' ELSE 'teacher' END,
           updated_at = datetime('now')`
      )
      .bind(crypto.randomUUID(), `vc_${vcId}`, email.toLowerCase(), name, vcId)
      .run();
  }

  // Upsert sections as classes
  for (const sec of sections) {
    const vcId = String(sec.attributes.section_pk || sec.id);
    const name =
      sec.attributes.section_name ||
      sec.attributes.name ||
      sec.attributes.course_name ||
      `Section ${vcId}`;

    await db
      .prepare(
        `INSERT INTO classes (id, veracross_id, name, subject, grade_level, school_year, term)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(veracross_id) DO UPDATE SET
           name = excluded.name,
           subject = excluded.subject,
           grade_level = excluded.grade_level,
           school_year = excluded.school_year,
           term = excluded.term`
      )
      .bind(
        crypto.randomUUID(),
        vcId,
        name,
        sec.attributes.course_name || null,
        sec.attributes.grade_level_name || null,
        sec.attributes.school_year_name || null,
        sec.attributes.term_name || null
      )
      .run();
  }

  // Sync student enrollments
  let enrollCount = 0;
  for (const e of enrollments) {
    const studentVcId = String(e.attributes.person_pk);
    const sectionVcId = String(e.attributes.section_pk);

    const student = await db
      .prepare(`SELECT id FROM users WHERE veracross_id = ?1`)
      .bind(studentVcId)
      .first<{ id: string }>();
    const cls = await db
      .prepare(`SELECT id FROM classes WHERE veracross_id = ?1`)
      .bind(sectionVcId)
      .first<{ id: string }>();

    if (!student || !cls) continue;

    await db
      .prepare(
        `INSERT OR IGNORE INTO enrollments (id, student_id, class_id)
         VALUES (?1, ?2, ?3)`
      )
      .bind(crypto.randomUUID(), student.id, cls.id)
      .run();
    enrollCount++;
  }

  // Sync teacher assignments
  let teacherCount = 0;
  for (const s of sectionStaff) {
    const teacherVcId = String(s.attributes.person_pk);
    const sectionVcId = String(s.attributes.section_pk);

    const teacher = await db
      .prepare(`SELECT id FROM users WHERE veracross_id = ?1`)
      .bind(teacherVcId)
      .first<{ id: string }>();
    const cls = await db
      .prepare(`SELECT id FROM classes WHERE veracross_id = ?1`)
      .bind(sectionVcId)
      .first<{ id: string }>();

    if (!teacher || !cls) continue;

    await db
      .prepare(
        `INSERT OR IGNORE INTO teacher_classes (id, teacher_id, class_id)
         VALUES (?1, ?2, ?3)`
      )
      .bind(crypto.randomUUID(), teacher.id, cls.id)
      .run();
    teacherCount++;
  }

  return {
    students: students.length,
    teachers: faculty.length,
    classes: sections.length,
    enrollments: enrollCount,
    teacherAssignments: teacherCount,
  };
}
