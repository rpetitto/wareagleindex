import { useState } from "react";
import QuadrantScatter from "./QuadrantScatter";

export interface TeacherOverviewData {
  school_year: {
    ei: { avg_c: number | null; avg_l: number | null; cnt: number; win_cnt: number; class_cnt: number } | null;
    mi: { avg_c: number | null; avg_l: number | null; cnt: number } | null;
    ei_points: { challenge: number; love: number }[];
    since: string;
  };
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

export default function TeacherOverviewCard({
  overview,
  title = "This School Year — All Classes",
  showEmpty = false,
}: {
  overview: TeacherOverviewData | null;
  title?: string;
  showEmpty?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const sy = overview?.school_year;
  const hasEi = sy?.ei && (sy.ei.avg_c != null || sy.ei.avg_l != null);
  const hasMi = sy?.mi && (sy.mi.avg_c != null || sy.mi.avg_l != null);
  const hasAny = hasEi || hasMi;

  if (!hasAny && !showEmpty) return null;

  if (!hasAny) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
        <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-400">No survey responses this school year.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-6 py-4 flex items-center justify-between text-left"
      >
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {sy.ei?.cnt ?? 0} EI response{(sy.ei?.cnt ?? 0) !== 1 ? "s" : ""} ·{" "}
            {sy.mi?.cnt ?? 0} MI response{(sy.mi?.cnt ?? 0) !== 1 ? "s" : ""} ·{" "}
            {sy.ei?.win_cnt ?? 0} window{(sy.ei?.win_cnt ?? 0) !== 1 ? "s" : ""} ·{" "}
            {sy.ei?.class_cnt ?? 0} class{(sy.ei?.class_cnt ?? 0) !== 1 ? "es" : ""}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {hasEi && (
            <div className="text-right hidden sm:block">
              <div className="text-xs text-gray-400">EI avg</div>
              <div className="text-sm font-semibold text-gray-800">
                {sy.ei!.avg_c?.toFixed(1)} / {sy.ei!.avg_l?.toFixed(1)}
              </div>
            </div>
          )}
          {hasMi && (
            <div className="text-right hidden sm:block">
              <div className="text-xs text-gray-400">MI avg</div>
              <div className="text-sm font-semibold text-gray-800">
                {sy.mi!.avg_c?.toFixed(1)} / {sy.mi!.avg_l?.toFixed(1)}
              </div>
            </div>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-50 px-6 py-5">
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="space-y-4">
              {hasEi && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Engagement Index</p>
                  <div className="space-y-1.5">
                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                        <span>Challenge</span><span>/ 10</span>
                      </div>
                      <MiniBar value={sy.ei!.avg_c} max={10} color="bg-green-400" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                        <span>Love</span><span>/ 10</span>
                      </div>
                      <MiniBar value={sy.ei!.avg_l} max={10} color="bg-green-400" />
                    </div>
                  </div>
                </div>
              )}
              {hasMi && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Mattering Index</p>
                  <div className="space-y-1.5">
                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                        <span>Connection</span><span>/ 5</span>
                      </div>
                      <MiniBar value={sy.mi!.avg_c} max={5} color="bg-blue-400" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                        <span>Contribution</span><span>/ 5</span>
                      </div>
                      <MiniBar value={sy.mi!.avg_l} max={5} color="bg-blue-400" />
                    </div>
                  </div>
                </div>
              )}
            </div>
            {sy.ei_points.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Engagement Scatter</p>
                <QuadrantScatter responses={sy.ei_points} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
