import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import NavBar from "../components/NavBar";

interface HistoryResponse {
  class_id: string;
  window_id: string;
  window_name: string;
  opens_at: string;
  submitted_at: string;
  type: string;
  // EI
  challenge?: number;
  love?: number;
  // MI
  connection?: number;
  contribution?: number;
  // Dimensions - just indicate it exists
  behavioral_effort?: number;
}

interface ClassHistory {
  class_id: string;
  class_name: string;
  teacher_name: string | null;
  subject: string | null;
  responses: HistoryResponse[];
  latest_at: string;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  engagement_index: { label: "EI", color: "bg-green-100 text-green-700" },
  mattering_index: { label: "MI", color: "bg-blue-100 text-blue-700" },
  dimensions: { label: "ED", color: "bg-purple-100 text-purple-700" },
};

function ResponseScores({ r }: { r: HistoryResponse }) {
  if (r.type === "engagement_index" && r.challenge != null && r.love != null) {
    return (
      <span className="text-xs text-gray-500">
        Challenge <strong className="text-gray-700">{r.challenge}</strong>/10 · Love <strong className="text-gray-700">{r.love}</strong>/10
      </span>
    );
  }
  if (r.type === "mattering_index" && r.connection != null && r.contribution != null) {
    return (
      <span className="text-xs text-gray-500">
        Connection <strong className="text-gray-700">{r.connection}</strong>/5 · Contribution <strong className="text-gray-700">{r.contribution}</strong>/5
      </span>
    );
  }
  if (r.type === "dimensions") {
    return <span className="text-xs text-gray-500">Dimensions survey</span>;
  }
  return null;
}

export default function StudentHistory() {
  const [history, setHistory] = useState<ClassHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/student/history")
      .then((r) => r.json())
      .then((d) => { setHistory(d as ClassHistory[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const totalResponses = history.reduce((sum, c) => sum + c.responses.length, 0);

  // Subject overview from EI responses
  const subjectMap = new Map<string, { challenges: number[]; loves: number[] }>();
  for (const cls of history) {
    const subject = cls.subject ?? cls.class_name.split(" ")[0];
    if (!subjectMap.has(subject)) subjectMap.set(subject, { challenges: [], loves: [] });
    const entry = subjectMap.get(subject)!;
    for (const r of cls.responses) {
      if (r.type === "engagement_index" && r.challenge != null && r.love != null) {
        entry.challenges.push(r.challenge);
        entry.loves.push(r.love);
      }
    }
  }
  const subjects = Array.from(subjectMap.entries())
    .filter(([, v]) => v.challenges.length > 0)
    .map(([subject, v]) => ({
      subject,
      avg_challenge: v.challenges.reduce((a, b) => a + b, 0) / v.challenges.length,
      avg_love: v.loves.reduce((a, b) => a + b, 0) / v.loves.length,
      count: v.challenges.length,
    }));

  return (
    <div className="min-h-screen bg-warm">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link to="/student" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">My Response History</h1>
        </div>

        {/* Stats */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6 flex items-center gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-crimson">{totalResponses}</div>
            <div className="text-sm text-gray-500 mt-0.5">Total Responses</div>
          </div>
          <div className="flex-1" />
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-700">{history.length}</div>
            <div className="text-sm text-gray-500 mt-0.5">Classes</div>
          </div>
        </div>

        {loading && <div className="text-center text-gray-400 py-12">Loading…</div>}

        {!loading && history.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
            No survey responses yet. Complete a survey to see your history here.
          </div>
        )}

        {/* Class cards */}
        <div className="space-y-4 mb-8">
          {history.map((cls) => (
            <div key={cls.class_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="font-semibold text-gray-900">{cls.class_name}</h2>
                {cls.teacher_name && (
                  <p className="text-xs text-gray-400 mt-0.5">{cls.teacher_name}</p>
                )}
              </div>
              <div className="divide-y divide-gray-50">
                {cls.responses.map((r, i) => {
                  const badge = TYPE_LABELS[r.type] ?? { label: "?", color: "bg-gray-100 text-gray-600" };
                  return (
                    <div key={`${r.window_id}-${r.type}-${i}`} className="px-5 py-3 flex items-center gap-3">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${badge.color}`}>
                        {badge.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate">{r.window_name}</p>
                        <ResponseScores r={r} />
                      </div>
                      <span className="text-xs text-gray-300 shrink-0">
                        {new Date(r.opens_at).toLocaleDateString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Subject overview */}
        {subjects.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <h3 className="font-semibold text-gray-800 text-sm">Engagement by Subject</h3>
              <p className="text-xs text-gray-400 mt-0.5">Based on your Engagement Index responses</p>
            </div>
            <div className="divide-y divide-gray-50">
              {subjects.map((s) => (
                <div key={s.subject} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{s.subject}</p>
                    <p className="text-xs text-gray-400">{s.count} response{s.count !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      Challenge <strong className="text-gray-700">{s.avg_challenge.toFixed(1)}</strong>/10
                    </p>
                    <p className="text-xs text-gray-500">
                      Love <strong className="text-gray-700">{s.avg_love.toFixed(1)}</strong>/10
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
