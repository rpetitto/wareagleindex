import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import NavBar from "../components/NavBar";

interface HistoryResponse {
  class_id: string;
  window_id: string;
  window_name: string;
  opens_at: string;
  submitted_at: string;
  type: string;
  challenge?: number;
  love?: number;
  connection?: number;
  contribution?: number;
}

interface ClassHistory {
  class_id: string;
  class_name: string;
  teacher_name: string | null;
  responses: HistoryResponse[];
}

interface SurveyWindow {
  window_id: string;
  window_name: string;
  opens_at: string;
  type: string;
  ratings: Array<{ class_id: string; class_name: string; teacher_name: string | null; challenge?: number; love?: number; connection?: number; contribution?: number }>;
}

function MiniScatter({ points, size = 80, single = false }: { points: { challenge: number; love: number }[]; size?: number; single?: boolean }) {
  const PAD = 6;
  const PLOT = size - PAD * 2;
  const toX = (c: number) => PAD + ((c - 1) / 9) * PLOT;
  const toY = (l: number) => PAD + ((10 - l) / 9) * PLOT;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0">
      <rect x={PAD} y={PAD} width={PLOT / 2} height={PLOT / 2} fill="rgba(234,179,8,0.12)" />
      <rect x={PAD + PLOT / 2} y={PAD} width={PLOT / 2} height={PLOT / 2} fill="rgba(34,197,94,0.12)" />
      <rect x={PAD} y={PAD + PLOT / 2} width={PLOT / 2} height={PLOT / 2} fill="rgba(156,163,175,0.12)" />
      <rect x={PAD + PLOT / 2} y={PAD + PLOT / 2} width={PLOT / 2} height={PLOT / 2} fill="rgba(239,68,68,0.12)" />
      <rect x={PAD} y={PAD} width={PLOT} height={PLOT} fill="none" stroke="#e5e7eb" strokeWidth="1" />
      <line x1={PAD + PLOT / 2} y1={PAD} x2={PAD + PLOT / 2} y2={PAD + PLOT} stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="2,2" />
      <line x1={PAD} y1={PAD + PLOT / 2} x2={PAD + PLOT} y2={PAD + PLOT / 2} stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="2,2" />
      {points.map((p, i) => (
        <circle key={i} cx={toX(p.challenge)} cy={toY(p.love)} r={single ? 4 : 3} fill="rgba(139,0,0,0.6)" stroke="white" strokeWidth={single ? 1.5 : 0.5} />
      ))}
    </svg>
  );
}

export default function StudentHistory() {
  const [history, setHistory] = useState<ClassHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [openWindowId, setOpenWindowId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/student/history")
      .then((r) => r.json())
      .then((d) => { setHistory(d as ClassHistory[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Group by survey window
  const windows = useMemo<SurveyWindow[]>(() => {
    const map = new Map<string, SurveyWindow>();
    for (const cls of history) {
      for (const r of cls.responses) {
        if (!map.has(r.window_id)) {
          map.set(r.window_id, { window_id: r.window_id, window_name: r.window_name, opens_at: r.opens_at, type: r.type, ratings: [] });
        }
        map.get(r.window_id)!.ratings.push({
          class_id: cls.class_id,
          class_name: cls.class_name,
          teacher_name: cls.teacher_name,
          challenge: r.challenge,
          love: r.love,
          connection: r.connection,
          contribution: r.contribution,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.opens_at.localeCompare(a.opens_at));
  }, [history]);

  return (
    <div className="min-h-screen bg-warm">
      <NavBar />
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link to="/student" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">My Survey History</h1>
        </div>

        {/* Stats */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6 flex gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-crimson">{windows.length}</div>
            <div className="text-sm text-gray-500 mt-0.5">Surveys completed</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-700">{history.flatMap(c => c.responses).length}</div>
            <div className="text-sm text-gray-500 mt-0.5">Total ratings</div>
          </div>
        </div>

        {loading && <div className="text-center text-gray-400 py-12">Loading…</div>}

        {!loading && windows.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
            No survey responses yet.
          </div>
        )}

        <div className="space-y-4">
          {windows.map((w) => {
            const eiPoints = w.ratings.filter(r => r.challenge != null && r.love != null).map(r => ({ challenge: r.challenge!, love: r.love! }));
            const isOpen = openWindowId === w.window_id;
            const isEI = w.type === "engagement_index";

            return (
              <div key={w.window_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => setOpenWindowId(isOpen ? null : w.window_id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900">{w.window_name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {new Date(w.opens_at).toLocaleDateString()} · {w.ratings.length} class{w.ratings.length !== 1 ? "es" : ""} rated
                    </div>
                  </div>
                  {isEI && eiPoints.length > 0 && <MiniScatter points={eiPoints} size={72} />}
                  <svg className={`w-4 h-4 text-gray-300 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-50 divide-y divide-gray-50">
                    {w.ratings.map((r) => (
                      <div key={r.class_id} className="flex items-center gap-4 px-5 py-3">
                        {isEI && r.challenge != null && r.love != null ? (
                          <MiniScatter points={[{ challenge: r.challenge, love: r.love }]} size={64} single />
                        ) : (
                          <div className="w-16 h-16 shrink-0 bg-gray-50 rounded-lg flex items-center justify-center text-xs text-gray-400">
                            {r.connection != null ? `${r.connection}/${r.contribution}` : "—"}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-900 truncate">{r.class_name}</div>
                          {r.teacher_name && <div className="text-xs text-gray-400">{r.teacher_name}</div>}
                          {isEI && r.challenge != null && (
                            <div className="text-xs text-gray-500 mt-0.5">Challenge: {r.challenge} · Love: {r.love}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

