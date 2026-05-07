import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import NavBar from "../components/NavBar";
import SlideOver from "../components/SlideOver";
import TeacherOverviewCard, { type TeacherOverviewData } from "../components/TeacherOverviewCard";
import { TeacherClassDetailContent } from "./TeacherClassDetail";

interface ClassWindow {
  id: string;
  name: string;
  type: string;
  opens_at: string;
  closes_at: string;
}

interface SyStat {
  avg_c: number | null;
  avg_l: number | null;
  cnt: number;
}

interface TeacherClass {
  id: string;
  name: string;
  subject: string | null;
  grade_level: string | null;
  school_year: string | null;
  term: string | null;
  veracross_id: string | null;
  begin_date: string | null;
  studentCount: number;
  windows: ClassWindow[];
  sy_ei: SyStat | null;
  sy_mi: SyStat | null;
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

function MiniBar({ value, max, color }: { value: number | null; max: number; color: string }) {
  const pct = value != null ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-600 w-6 text-right tabular-nums">
        {value != null ? value.toFixed(1) : "—"}
      </span>
    </div>
  );
}

export default function TeacherDashboard() {
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [overview, setOverview] = useState<TeacherOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/teacher/classes").then((r) => r.json()),
      fetch("/api/teacher/overview").then((r) => r.json()),
    ]).then(([cls, ov]) => {
      setClasses(cls as TeacherClass[]);
      setOverview(ov as TeacherOverview);
      setLoading(false);
    }).catch(() => setLoading(false));
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

        {!loading && overview && (
          <div className="mb-6">
            <TeacherOverviewCard overview={overview} title="This School Year — All My Classes" />
          </div>
        )}

        {!loading && classes.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <p className="text-gray-400">No classes assigned yet.</p>
            <p className="text-gray-400 text-sm mt-1">Classes are synced automatically from Veracross. Ask your administrator to run a sync.</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => {
            const active = cls.windows.filter(isActive);
            const past = cls.windows.filter((w) => !isActive(w));
            const hasStats = cls.sy_ei?.cnt || cls.sy_mi?.cnt;

            return (
              <div key={cls.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                {/* Class header */}
                <div className="px-5 py-4 border-b border-gray-50">
                  <button
                    onClick={() => setSelectedClassId(cls.id)}
                    className="font-semibold text-gray-900 leading-tight hover:text-crimson transition-colors block text-left w-full"
                  >
                    {cls.name}
                  </button>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {cls.subject && (
                      <span className="text-xs text-gray-400">{cls.subject}</span>
                    )}
                    {cls.grade_level && (
                      <span className="text-xs text-gray-400">· Grade {cls.grade_level}</span>
                    )}
                    {cls.veracross_id && (
                      <span className="text-xs text-gray-300">VC #{cls.veracross_id}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-xs text-gray-500">{cls.studentCount} students</span>
                  </div>

                  {/* School-year stats */}
                  {hasStats ? (
                    <div className="mt-3 pt-3 border-t border-gray-50 space-y-1.5">
                      {cls.sy_ei?.cnt ? (
                        <div>
                          <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                            <span className="font-medium">EI this year</span>
                            <span>{cls.sy_ei.cnt} response{cls.sy_ei.cnt !== 1 ? "s" : ""}</span>
                          </div>
                          <div className="space-y-0.5">
                            <MiniBar value={cls.sy_ei.avg_c} max={10} color="bg-green-400" />
                            <MiniBar value={cls.sy_ei.avg_l} max={10} color="bg-green-400" />
                          </div>
                        </div>
                      ) : null}
                      {cls.sy_mi?.cnt ? (
                        <div>
                          <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                            <span className="font-medium">MI this year</span>
                            <span>{cls.sy_mi.cnt} response{cls.sy_mi.cnt !== 1 ? "s" : ""}</span>
                          </div>
                          <div className="space-y-0.5">
                            <MiniBar value={cls.sy_mi.avg_c} max={5} color="bg-blue-400" />
                            <MiniBar value={cls.sy_mi.avg_l} max={5} color="bg-blue-400" />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {/* Surveys */}
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

      <SlideOver open={selectedClassId != null} onClose={() => setSelectedClassId(null)}>
        {selectedClassId && (
          <TeacherClassDetailContent
            classId={selectedClassId}
            onClose={() => setSelectedClassId(null)}
          />
        )}
      </SlideOver>
    </div>
  );
}
