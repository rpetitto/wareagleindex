import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import NavBar from "../components/NavBar";

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

  useEffect(() => {
    fetch("/api/teacher/classes")
      .then((r) => r.json())
      .then((data) => { setClasses(data as TeacherClass[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const activeWindowCount = classes.reduce(
    (sum, cls) => sum + cls.windows.filter(isActive).length,
    0
  );

  return (
    <div className="min-h-screen bg-warm">
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Classes</h1>
          <p className="text-gray-500 mt-1">
            {classes.length} {classes.length === 1 ? "class" : "classes"} ·{" "}
            {activeWindowCount} active survey{activeWindowCount !== 1 ? "s" : ""}
          </p>
        </div>

        {loading && <div className="text-center text-gray-400 py-12">Loading…</div>}

        {!loading && classes.length === 0 && (
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
