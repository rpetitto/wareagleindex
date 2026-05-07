import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";

interface AggregateData {
  cls: {
    id: string;
    name: string;
    veracross_id: string | null;
    grade_level: string | null;
    primary_teacher_name: string | null;
    begin_date: string | null;
    end_date: string | null;
    studentCount: number;
  };
  latest_window: {
    window: { id: string; name: string; opens_at: string };
    ei: { avg_c: number | null; avg_l: number | null; cnt: number } | null;
    mi: { avg_c: number | null; avg_l: number | null; cnt: number } | null;
  } | null;
  school_year: {
    ei: { avg_c: number | null; avg_l: number | null; cnt: number } | null;
    mi: { avg_c: number | null; avg_l: number | null; cnt: number } | null;
    window_count: number;
  };
  lifetime_course: {
    ei: { avg_c: number | null; avg_l: number | null; ei_cnt: number; win_cnt: number } | null;
    mi: { avg_c: number | null; avg_l: number | null; ei_cnt: number; win_cnt: number } | null;
    class_count: number;
  };
}

function MetricBar({ value, max, color }: { value: number | null; max: number; color: string }) {
  const pct = value != null ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-8 text-right">
        {value != null ? value.toFixed(1) : "—"}
      </span>
    </div>
  );
}

function AggSection({
  title,
  subtitle,
  ei,
  mi,
  windowCount,
  responseCount,
}: {
  title: string;
  subtitle?: string;
  ei: { avg_c: number | null; avg_l: number | null } | null | undefined;
  mi: { avg_c: number | null; avg_l: number | null } | null | undefined;
  windowCount?: number;
  responseCount?: number;
}) {
  const hasEi = ei && (ei.avg_c != null || ei.avg_l != null);
  const hasMi = mi && (mi.avg_c != null || mi.avg_l != null);
  const isEmpty = !hasEi && !hasMi;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="text-right">
          {windowCount != null && windowCount > 0 && (
            <p className="text-xs text-gray-400">{windowCount} window{windowCount !== 1 ? "s" : ""}</p>
          )}
          {responseCount != null && (
            <p className="text-xs text-gray-400">{responseCount} response{responseCount !== 1 ? "s" : ""}</p>
          )}
        </div>
      </div>
      {isEmpty ? (
        <p className="text-sm text-gray-400">No responses yet</p>
      ) : (
        <div className="space-y-4">
          {hasEi && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Engagement Index</p>
              <div className="space-y-1.5">
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                    <span>Challenge</span><span>/ 10</span>
                  </div>
                  <MetricBar value={ei!.avg_c} max={10} color="bg-green-400" />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                    <span>Love</span><span>/ 10</span>
                  </div>
                  <MetricBar value={ei!.avg_l} max={10} color="bg-green-400" />
                </div>
              </div>
            </div>
          )}
          {hasMi && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Mattering Index</p>
              <div className="space-y-1.5">
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                    <span>Connection</span><span>/ 5</span>
                  </div>
                  <MetricBar value={mi!.avg_c} max={5} color="bg-blue-400" />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                    <span>Contribution</span><span>/ 5</span>
                  </div>
                  <MetricBar value={mi!.avg_l} max={5} color="bg-blue-400" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TeacherClassDetail() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<AggregateData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/teacher/classes/${classId}/aggregates`)
      .then((r) => r.json())
      .then((d) => { setData(d as AggregateData); setLoading(false); })
      .catch(() => setLoading(false));
  }, [classId]);

  if (loading) return (
    <div className="min-h-screen bg-warm">
      <NavBar />
      <div className="text-center text-gray-400 py-12">Loading…</div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-warm">
      <NavBar />
      <div className="text-center text-gray-400 py-12">Class not found.</div>
    </div>
  );

  const { cls, latest_window, school_year, lifetime_course } = data;

  return (
    <div className="min-h-screen bg-warm">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate("/teacher")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to My Classes
        </button>

        {/* Class header card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 mb-6">
          <h1 className="text-xl font-bold text-gray-900">{cls.name}</h1>
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
            {cls.veracross_id && <span>VC #{cls.veracross_id}</span>}
            {cls.grade_level && <span>· Grade {cls.grade_level}</span>}
            <span>· {cls.studentCount} students</span>
            {cls.primary_teacher_name && <span>· {cls.primary_teacher_name}</span>}
          </div>
          {cls.begin_date && cls.end_date && (
            <p className="text-xs text-gray-400 mt-1">
              {new Date(cls.begin_date).toLocaleDateString()} – {new Date(cls.end_date).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="space-y-4">
          {/* Latest Survey */}
          <AggSection
            title="Latest Survey"
            subtitle={latest_window ? `${latest_window.window.name} · ${new Date(latest_window.window.opens_at).toLocaleDateString()}` : undefined}
            ei={latest_window?.ei}
            mi={latest_window?.mi}
            responseCount={latest_window ? ((latest_window.ei?.cnt ?? 0) + (latest_window.mi?.cnt ?? 0)) : undefined}
          />

          {/* School Year */}
          <AggSection
            title="This School Year"
            subtitle={cls.begin_date ? `Since ${new Date(cls.begin_date).toLocaleDateString()}` : "Last 12 months"}
            ei={school_year.ei}
            mi={school_year.mi}
            windowCount={school_year.window_count}
          />

          {/* Lifetime course */}
          <AggSection
            title={`Lifetime — ${cls.name}`}
            subtitle={`Across ${lifetime_course.class_count} section${lifetime_course.class_count !== 1 ? "s" : ""} you have taught`}
            ei={lifetime_course.ei}
            mi={lifetime_course.mi}
          />

          {/* Link to past survey windows */}
          {latest_window && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Survey Results</h3>
              <Link
                to={`/teacher/class/${cls.id}/window/${latest_window.window.id}`}
                className="flex items-center justify-between py-2 text-sm text-gray-700 hover:text-crimson transition-colors group"
              >
                <span>{latest_window.window.name}</span>
                <svg className="w-4 h-4 text-gray-300 group-hover:text-crimson" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
