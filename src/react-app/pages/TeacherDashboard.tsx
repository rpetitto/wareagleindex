import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import NavBar from "../components/NavBar";

interface AllClass {
  id: string;
  name: string;
  subject: string | null;
  grade_level: string | null;
  school_year: string | null;
  primary_teacher_name: string | null;
  primary_teacher_vc_id: string | null;
  is_mine: number;
  student_count: number;
}

function ClaimClassesPanel({ onDone }: { onDone: () => void }) {
  const [all, setAll] = useState<AllClass[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/teacher/all-classes")
      .then((r) => r.json())
      .then((d) => { setAll(d as AllClass[]); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(load, []);

  async function toggle(cls: AllClass) {
    setToggling(cls.id);
    await fetch(`/api/teacher/claim-class/${cls.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim: !cls.is_mine }),
    });
    load();
    setToggling(null);
  }

  const filtered = all.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.primary_teacher_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const mine = filtered.filter((c) => c.is_mine);
  const others = filtered.filter((c) => !c.is_mine);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-8">
      <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Claim Your Classes</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Select the classes you teach. Teachers aren't automatically linked from Veracross — claim yours here.
          </p>
        </div>
        {mine.length > 0 && (
          <button
            onClick={onDone}
            className="text-sm bg-crimson text-white px-4 py-2 rounded-xl font-medium hover:bg-crimson-dark transition-colors"
          >
            Done ({mine.length} claimed)
          </button>
        )}
      </div>

      <div className="px-6 py-3 border-b border-gray-50">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search classes or teacher name…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crimson/30"
        />
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">No classes found.</div>
          )}
          {[...mine, ...others].map((cls) => (
            <div key={cls.id} className={`flex items-center gap-3 px-6 py-3 ${cls.is_mine ? "bg-green-50/50" : ""}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{cls.name}</p>
                <p className="text-xs text-gray-400">
                  {cls.primary_teacher_name ? `${cls.primary_teacher_name} · ` : ""}
                  {cls.grade_level ? `Grade ${cls.grade_level}` : ""}
                  {cls.student_count ? ` · ${cls.student_count} students` : ""}
                </p>
              </div>
              <button
                onClick={() => toggle(cls)}
                disabled={toggling === cls.id}
                className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                  cls.is_mine
                    ? "bg-green-100 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                    : "bg-white text-gray-600 border-gray-200 hover:border-crimson hover:text-crimson"
                }`}
              >
                {toggling === cls.id ? "…" : cls.is_mine ? "✓ My Class" : "Claim"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ClassWindow {
  id: string;
  name: string;
  type: string;
  opens_at: string;
  closes_at: string;
}

interface TeacherClass {
  id: string;
  name: string;
  subject: string | null;
  grade_level: string | null;
  school_year: string | null;
  term: string | null;
  studentCount: number;
  windows: ClassWindow[];
}

const TYPE_BADGE: Record<string, string> = {
  engagement_index: "bg-green-100 text-green-700",
  mattering_index: "bg-blue-100 text-blue-700",
  dimensions: "bg-purple-100 text-purple-700",
};

const TYPE_SHORT: Record<string, string> = {
  engagement_index: "EI",
  mattering_index: "MI",
  dimensions: "ED",
};

function isActive(w: ClassWindow) {
  const now = Date.now();
  return new Date(w.opens_at).getTime() <= now && new Date(w.closes_at).getTime() >= now;
}

export default function TeacherDashboard() {
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClaiming, setShowClaiming] = useState(false);

  useEffect(() => {
    fetch("/api/teacher/classes")
      .then((r) => r.json())
      .then((data) => { setClasses(data as TeacherClass[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function handleClaimDone() {
    setShowClaiming(false);
    setLoading(true);
    fetch("/api/teacher/classes")
      .then((r) => r.json())
      .then((data) => { setClasses(data as TeacherClass[]); setLoading(false); })
      .catch(() => setLoading(false));
  }

  const activeWindowCount = classes.reduce(
    (sum, cls) => sum + cls.windows.filter(isActive).length,
    0
  );

  return (
    <div className="min-h-screen bg-warm">
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Classes</h1>
            <p className="text-gray-500 mt-1">
              {classes.length} {classes.length === 1 ? "class" : "classes"} ·{" "}
              {activeWindowCount} active survey{activeWindowCount !== 1 ? "s" : ""}
            </p>
          </div>
          {!loading && (
            <button
              onClick={() => setShowClaiming((v) => !v)}
              className="text-sm border border-gray-200 px-4 py-2 rounded-xl text-gray-600 hover:border-crimson hover:text-crimson transition-colors"
            >
              {showClaiming ? "Hide" : "Manage Classes"}
            </button>
          )}
        </div>

        {(showClaiming || (!loading && classes.length === 0)) && (
          <ClaimClassesPanel onDone={handleClaimDone} />
        )}

        {loading && <div className="text-center text-gray-400 py-12">Loading…</div>}

        {!loading && classes.length === 0 && !showClaiming && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <p className="text-gray-400">No classes assigned yet. Contact your administrator.</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => {
            const active = cls.windows.filter(isActive);
            const past = cls.windows.filter((w) => !isActive(w));

            return (
              <div key={cls.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                {/* Class header */}
                <div className="px-5 py-4 border-b border-gray-50">
                  <h2 className="font-semibold text-gray-900 leading-tight">{cls.name}</h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {cls.subject && (
                      <span className="text-xs text-gray-400">{cls.subject}</span>
                    )}
                    {cls.grade_level && (
                      <span className="text-xs text-gray-400">· Grade {cls.grade_level}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-xs text-gray-500">{cls.studentCount} students</span>
                  </div>
                </div>

                {/* Active surveys */}
                <div className="flex-1 px-5 py-3">
                  {active.length === 0 && past.length === 0 && (
                    <p className="text-xs text-gray-400 py-2">No surveys yet</p>
                  )}

                  {active.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active</p>
                      {active.map((w) => (
                        <Link
                          key={w.id}
                          to={`/teacher/class/${cls.id}/window/${w.id}`}
                          className="flex items-center gap-2 py-1.5 group"
                        >
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${TYPE_BADGE[w.type] ?? "bg-gray-100 text-gray-600"}`}>
                            {TYPE_SHORT[w.type] ?? "?"}
                          </span>
                          <span className="text-sm text-gray-700 group-hover:text-crimson transition-colors truncate">
                            {w.name}
                          </span>
                          <svg className="w-3.5 h-3.5 text-crimson ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      ))}
                    </>
                  )}

                  {past.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-3 mb-2">Past</p>
                      {past.slice(0, 3).map((w) => (
                        <Link
                          key={w.id}
                          to={`/teacher/class/${cls.id}/window/${w.id}`}
                          className="flex items-center gap-2 py-1.5 group"
                        >
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded opacity-60 ${TYPE_BADGE[w.type] ?? "bg-gray-100 text-gray-600"}`}>
                            {TYPE_SHORT[w.type] ?? "?"}
                          </span>
                          <span className="text-sm text-gray-400 group-hover:text-gray-600 transition-colors truncate">
                            {w.name}
                          </span>
                          <svg className="w-3.5 h-3.5 text-gray-300 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      ))}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
