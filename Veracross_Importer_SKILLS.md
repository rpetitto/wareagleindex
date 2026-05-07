# Veracross Importer — Skills Reference

A complete reference for importing people, classes, enrollments, grading periods, and photos from the Veracross v3 API into a Fling (or any Cloudflare Workers / D1) project.

---

## Authentication

Veracross uses OAuth 2.0 client credentials.

```typescript
async function getVCToken(): Promise<string> {
  const school  = secrets.get("VERACROSS_SCHOOL");        // e.g. "woodward"
  const clientId     = secrets.get("VERACROSS_CLIENT_ID");
  const clientSecret = secrets.get("VERACROSS_CLIENT_SECRET");

  const res = await fetch(`https://accounts.veracross.com/${school}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "client_credentials",
      client_id:     clientId,
      client_secret: clientSecret,
      scope:         "read",
    }),
  });
  const data = await res.json() as { access_token: string };
  return data.access_token;
}
```

**Required secrets:** `VERACROSS_SCHOOL`, `VERACROSS_CLIENT_ID`, `VERACROSS_CLIENT_SECRET`

---

## Paginated Fetch Helper

All list endpoints are paginated. This helper fetches all pages automatically.

```typescript
const BASE = `https://api.veracross.com/${secrets.get("VERACROSS_SCHOOL")}/v3`;

async function vcGet<T>(base: string, path: string, token: string): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  const MAX_PAGES = 20; // safety cap; raise if needed

  while (page <= MAX_PAGES) {
    const url = `${base}/${path}${path.includes("?") ? "&" : "?"}page=${page}&per_page=100`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Veracross ${path} failed: ${res.status}`);
    const body = await res.json() as { data: T[] };
    if (!body.data?.length) break;
    results.push(...body.data);
    if (body.data.length < 100) break;
    page++;
  }
  return results;
}
```

> **Note:** The `page` + `per_page` parameters go in the query string. The response envelope is `{ data: T[] }`.

---

## School Year Convention

Veracross uses the **start year** of the academic year:
- 2025–2026 school year → `school_year = 2025`
- 2026–2027 school year → `school_year = 2026`

```typescript
function currentSchoolYear(): number {
  const now = new Date();
  const year = now.getUTCFullYear();
  // Academic year starts in August (month 7 in 0-indexed)
  return now.getUTCMonth() >= 7 ? year : year - 1;
}
```

---

## 1. Teachers / Staff

**Endpoint:** `GET academics/staff`

```typescript
interface VCStaff {
  id: number;
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
  email_1?: string | null;
  roles?: string | null;       // comma-separated, e.g. "Faculty,Staff"
  job_title?: string | null;
  faculty_type?: number | null;
}

const allStaff = await vcGet<VCStaff>(BASE, "academics/staff", token);

// Filter to faculty only
const faculty = allStaff.filter((s) => (s.roles ?? "").includes("Faculty"));
```

**DB upsert:**

```sql
INSERT INTO users (id, google_id, email, name, picture, role, veracross_id)
VALUES (?, ?, ?, ?, NULL, 'teacher', ?)
ON CONFLICT(email) DO UPDATE SET
  name        = excluded.name,
  veracross_id = excluded.veracross_id,
  role        = CASE WHEN role = 'admin' THEN 'admin' ELSE 'teacher' END
```

> [^1] To import **all staff** (not just faculty), remove the `.filter()` call.
> [^2] To also import **administrators**, add `|| (s.roles ?? "").includes("Administrator")` to the filter.

---

## 2. Students

**Endpoint:** `GET academics/students`

```typescript
interface VCStudent {
  id: number;
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
  email_1?: string | null;
  grade_level?: string | null;
  currently_enrolled?: boolean;
}

const allStudents = await vcGet<VCStudent>(BASE, "academics/students", token);

// Only import currently-enrolled students
const activeStudents = allStudents.filter((s) => s.currently_enrolled !== false);
```

**DB upsert:**

```sql
INSERT INTO users (id, google_id, email, name, picture, role, veracross_id)
VALUES (?, ?, ?, ?, NULL, 'student', ?)
ON CONFLICT(email) DO UPDATE SET
  name        = excluded.name,
  veracross_id = excluded.veracross_id
```

> [^3] To import **all** students (including alumni/withdrawn), remove the `currently_enrolled` filter.
> [^4] The `google_id` must be populated separately via Google OAuth — Veracross does not provide it.

---

## 3. Grading Periods (Date Ranges)

Grading periods give you the `start_date` / `end_date` for each semester or term. Use these to tag classes with their date range.

**Endpoint:** `GET academics/config/grading_periods?school_year={year}`

```typescript
interface VCGradingPeriod {
  id: number;
  description: string;
  abbreviation: string;
  start_date: string | null;  // ISO date "2025-08-15"
  end_date:   string | null;
  school_year: number;
}

const sy = currentSchoolYear();
const gradingPeriods = await vcGet<VCGradingPeriod>(
  BASE,
  `academics/config/grading_periods?school_year=${sy}`,
  token
);
// Build a map: gradingPeriod.id → { start_date, end_date }
const gpMap = new Map(gradingPeriods.map((gp) => [gp.id, gp]));
```

> [^5] The `school_year` filter works correctly on this endpoint. Always pass it to avoid fetching all historical periods.

---

## 4. Classes (via Enrollments)

The most reliable way to discover active classes is through the enrollments endpoint, which includes `class_description`, `internal_class_id`, `primary_teacher`, `grade_level_id`, and grading period linkage.

**Endpoint:** `GET academics/enrollments?currently_enrolled=true`

```typescript
interface VCEnrollment {
  id: number;
  internal_class_id: number;
  class_description: string;
  class_status: string | number | null;
  currently_enrolled: boolean;
  exclude_from_transcript?: boolean | null;
  grade_level_id: number;
  person_id: number;           // student's Veracross ID
  date_withdrawn?: string | null;
  course_type?: number | null; // see Course Types below
  primary_teacher?: {
    id: number;
    first_name: string;
    last_name: string;
    preferred_name?: string | null;
  } | null;
}

const allEnrollments = await vcGet<VCEnrollment>(
  BASE,
  "academics/enrollments?currently_enrolled=true",
  token
);
```

### Course Types (Veracross Standard)

| ID | Type            |
|----|-----------------|
| 1  | Homeroom        |
| 2  | Advisory        |
| 3  | Academic        |
| 4  | Non-Academic    |
| 5  | Athletic Program|
| 6  | Other Program   |
| 7  | Extended-Care   |
| 8  | Summer          |
| 9  | Dorm            |

**Default: import course types 3 (Academic) and 4 (Non-Academic) only.**

### Filtering Enrollments

```typescript
const ALLOWED_COURSE_TYPES = new Set([3, 4]);

// Patterns to exclude obvious non-survey classes
const NON_ACADEMIC_PATTERNS = [
  /\bhomeroom\b/i,
  /\badvisory\b/i,
  /\br[-\s]?period\b/i,
  /\bstudy\s+hall\b/i,
  /\bfree\s+period\b/i,
  /\blunch\b/i,
  /\bchapel\b/i,
  /\bassembly\b/i,
  /\bactivity\s+period\b/i,
  /^class of \d+/i,
];

function isNonAcademic(name: string): boolean {
  return NON_ACADEMIC_PATTERNS.some((rx) => rx.test(name));
}

function isWithdrawn(dateWithdrawn?: string | null): boolean {
  if (!dateWithdrawn) return false;
  return Date.parse(dateWithdrawn) < Date.now();
}

const activeEnrollments = allEnrollments.filter((e) =>
  e.currently_enrolled &&
  e.exclude_from_transcript !== true &&
  String(e.class_status).toLowerCase() !== "future" &&
  !isWithdrawn(e.date_withdrawn) &&
  !isNonAcademic(e.class_description ?? "") &&
  (e.course_type == null || ALLOWED_COURSE_TYPES.has(e.course_type))
);
```

> [^6] To import **all** course types (including homeroom, athletics, etc.), remove the `course_type` filter line entirely.
> [^7] To include a **specific** course type (e.g. athletics), add its ID to `ALLOWED_COURSE_TYPES`.
> [^8] To disable regex name filtering, remove the `isNonAcademic` call.

### Building the Class Map

```typescript
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
  const teacherName = e.primary_teacher
    ? ((e.primary_teacher.preferred_name?.trim() || e.primary_teacher.first_name?.trim()) +
       " " + e.primary_teacher.last_name?.trim()).trim()
    : null;
  classMap.set(e.internal_class_id, {
    vcId:        String(e.internal_class_id),
    name:        e.class_description,
    gradeLevel:  e.grade_level_id != null ? String(e.grade_level_id) : null,
    teacherVcId: e.primary_teacher?.id ? String(e.primary_teacher.id) : null,
    teacherName,
    beginDate:   null, // populated below via class_schedules
    endDate:     null,
  });
}
```

---

## 5. Class Date Ranges (via Class Schedules)

`class_schedules` maps each class section to its grading period, giving you semester start/end dates.

**Endpoint:** `GET academics/class_schedules` *(no school_year filter — it doesn't work)*

```typescript
interface VCClassSchedule {
  id: number;
  internal_class_id: number;
  class_id: string;
  school_year: number;
  grading_period?: {
    id: number;
    description: string;
    abbreviation: string;
  } | null;
}

// Fetch ALL schedules (no school_year filter — it returns 0 rows if used)
const classSchedules = await vcGet<VCClassSchedule>(BASE, "academics/class_schedules", token);

// Build: internal_class_id → { begin_date, end_date }
const classDateRange = new Map<number, { begin_date: string; end_date: string }>();
for (const sched of classSchedules) {
  if (!sched.grading_period) continue;
  const gp = gpMap.get(sched.grading_period.id);
  if (!gp?.start_date || !gp?.end_date) continue;
  classDateRange.set(sched.internal_class_id, {
    begin_date: gp.start_date,
    end_date:   gp.end_date,
  });
}
```

> [^9] **Do NOT use `class_schedules` as an enrollment allowlist.** Many PE, elective, and non-academic classes have no schedule entry but are valid classes. Use it only for date ranges.
> [^10] The `?school_year=` filter silently returns 0 rows on this endpoint — always fetch unfiltered and cap pages to avoid D1 timeouts on large datasets.

---

## 6. Enrollments (Student → Class)

After building the class map, link students to classes.

```typescript
// Resolve DB IDs
const userRows = await db.prepare(
  "SELECT id, veracross_id FROM users WHERE veracross_id IS NOT NULL"
).all<{ id: string; veracross_id: string }>();
const userIdByVcId = new Map(userRows.results.map((u) => [u.veracross_id, u.id]));

const classRows = await db.prepare(
  "SELECT id, veracross_id FROM classes WHERE veracross_id IS NOT NULL"
).all<{ id: string; veracross_id: string }>();
const classIdByVcId = new Map(classRows.results.map((c) => [c.veracross_id, c.id]));

const enrollStmts = [];
for (const e of activeEnrollments) {
  const studentId = userIdByVcId.get(String(e.person_id));
  const classId   = classIdByVcId.get(String(e.internal_class_id));
  if (!studentId || !classId) continue;
  enrollStmts.push(
    db.prepare(
      "INSERT OR IGNORE INTO enrollments (id, student_id, class_id) VALUES (?, ?, ?)"
    ).bind(crypto.randomUUID(), studentId, classId)
  );
}
// Batch in chunks of 50 to avoid D1 statement limits
for (let i = 0; i < enrollStmts.length; i += 50) {
  await db.batch(enrollStmts.slice(i, i + 50));
}
```

---

## 7. Photos

Photos are fetched separately. The photo endpoint returns a `download_url` per person.

**Endpoint:** `GET accounts/photos` *(or `academics/photos` — check your school's API scope)*

```typescript
interface VCPhoto {
  id: number;
  person_id: number;
  download_url: string;
}

const photos = await vcGet<VCPhoto>(BASE, "accounts/photos", token);
const photoMap = new Map(photos.map((p) => [p.person_id, p.download_url]));

// Apply to users
for (const user of [...faculty, ...activeStudents]) {
  const photoUrl = photoMap.get(user.id);
  if (!photoUrl) continue;
  await db.prepare(
    "UPDATE users SET picture = ? WHERE veracross_id = ?"
  ).bind(photoUrl, String(user.id)).run();
}
```

> [^11] Veracross photo URLs expire. Store the URL at sync time and refresh on each sync rather than treating them as permanent.
> [^12] Fetching photos inside a Fling Workflow step (not at the top level) avoids `SQLITE_TOOBIG` errors from storing large data in the workflow scratchpad.
> [^13] To **skip photos** entirely (faster sync), omit the photo fetch and upsert steps.

---

## 8. Teacher ↔ Class Assignments

```typescript
// Build: teacherVcId → DB user id
const teacherIdByVcId = new Map<string, string>();
for (const row of userRows.results) {
  teacherIdByVcId.set(row.veracross_id, row.id);
}

const tcStmts = [];
for (const cls of classMap.values()) {
  if (!cls.teacherVcId) continue;
  const teacherUserId = teacherIdByVcId.get(cls.teacherVcId);
  const classId       = classIdByVcId.get(cls.vcId);
  if (!teacherUserId || !classId) continue;
  tcStmts.push(
    db.prepare(
      "INSERT OR IGNORE INTO teacher_classes (id, teacher_id, class_id) VALUES (?, ?, ?)"
    ).bind(crypto.randomUUID(), teacherUserId, classId)
  );
}
for (let i = 0; i < tcStmts.length; i += 50) {
  await db.batch(tcStmts.slice(i, i + 50));
}
```

---

## 9. Minimum Required DB Schema

```sql
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  google_id    TEXT UNIQUE NOT NULL,
  email        TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  picture      TEXT,
  role         TEXT NOT NULL DEFAULT 'student',
  veracross_id TEXT
);

CREATE TABLE IF NOT EXISTS classes (
  id                    TEXT PRIMARY KEY,
  veracross_id          TEXT UNIQUE,
  name                  TEXT NOT NULL,
  grade_level           TEXT,
  primary_teacher_vc_id TEXT,
  primary_teacher_name  TEXT,
  begin_date            TEXT,
  end_date              TEXT
);

CREATE TABLE IF NOT EXISTS enrollments (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id),
  class_id   TEXT NOT NULL REFERENCES classes(id),
  UNIQUE(student_id, class_id)
);

CREATE TABLE IF NOT EXISTS teacher_classes (
  id         TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES users(id),
  class_id   TEXT NOT NULL REFERENCES classes(id),
  UNIQUE(teacher_id, class_id)
);
```

---

## 10. Recommended Import Order

1. **Grading periods** — needed to resolve class date ranges
2. **Staff / Teachers** — needed before teacher_classes
3. **Students** — needed before enrollments
4. **Class schedules** — needed to populate `begin_date`/`end_date` on classes
5. **Enrollments** (+ build class map) — creates classes + enrollments
6. **Teacher assignments** — link teachers to classes
7. **Photos** — update `picture` field on users

---

## 11. Quick Filter Reference

| Goal | Change |
|---|---|
| Import all course types | Remove `course_type` filter |
| Include athletics (type 5) | Add `5` to `ALLOWED_COURSE_TYPES` |
| Disable name regex filter | Remove `isNonAcademic` call |
| Import withdrawn students | Remove `isWithdrawn` check |
| Import all staff (not just Faculty) | Remove `.filter()` on staff roles |
| Skip photos | Omit photo fetch entirely |
| Faster sync (no date ranges) | Skip class_schedules fetch |
| All grading periods (not current year) | Remove `?school_year=` from grading_periods URL |
