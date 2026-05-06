import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import QuadrantScatter from "../components/QuadrantScatter";
import DimensionBars from "../components/DimensionBars";
import { useAuth } from "../App";

interface MatteringResponse { connection: number; contribution: number }

interface ResultData {
  window: { id: string; name: string; type: string };
  class: { id: string; name: string; subject: string | null; grade_level: string | null };
  studentCount: number;
  responses: unknown[];
}

const TYPE_LABELS: Record<string, string> = {
  engagement_index: "Engagement Index",
  mattering_index: "Mattering Index",
  dimensions: "Engagement Dimensions",
};

function avg(arr: number[]) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

export default function ClassResults() {
  const { classId, windowId } = useParams<{ classId: string; windowId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = user?.role === "admin" ? "/api/admin" : "/api/teacher";
    fetch(`${base}/classes/${classId}/results/${windowId}`)
      .then((r) => r.json())
      .then((d) => { setData(d as ResultData); setLoading(false); })
      .catch(() => setLoading(false));
  }, [classId, windowId, user]);

  const backTo = user?.role === "admin" ? "/admin" : "/teacher";

  if (loading) {
    return (
      <div className="min-h-screen bg-warm">
        <NavBar />
        <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-warm">
        <NavBar />
        <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-500">
          Results not found.
          <button onClick={() => navigate(backTo)} className="block mx-auto mt-3 text-crimson underline text-sm">
            Go back
          </button>
        </div>
      </div>
    );
  }

  const responseCount = data.responses.length;
  const responseRate = data.studentCount > 0 ? (responseCount / data.studentCount) * 100 : 0;

  return (
    <div className="min-h-screen bg-warm">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* Header card */}
        <div className="bg-crimson text-white rounded-2xl px-6 py-5 mb-6 shadow-sm">
          <div className="text-sm text-white/70 font-medium mb-1">
            {TYPE_LABELS[data.window.type] ?? data.window.type}
          </div>
          <h1 className="text-xl font-bold">{data.class.name}</h1>
          <p className="text-white/80 text-sm mt-0.5">{data.window.name}</p>
          <div className="flex items-center gap-4 mt-4 text-sm">
            <div>
              <span className="text-white/60">Responses </span>
              <strong>{responseCount} / {data.studentCount}</strong>
            </div>
            <div>
              <span className="text-white/60">Rate </span>
              <strong>{responseRate.toFixed(0)}%</strong>
            </div>
          </div>
          {/* Response rate bar */}
          <div className="mt-2 bg-white/20 rounded-full h-2 overflow-hidden">
            <div className="bg-gold h-full rounded-full" style={{ width: `${responseRate}%` }} />
          </div>
        </div>

        {/* Results */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          {data.window.type === "engagement_index" && (
            <>
              <h2 className="font-semibold text-gray-800 mb-4">Challenge × Love of Learning</h2>
              <QuadrantScatter responses={data.responses as { challenge: number; love: number }[]} />
            </>
          )}

          {data.window.type === "mattering_index" && (
            <>
              <h2 className="font-semibold text-gray-800 mb-6">Connection & Contribution</h2>
              {responseCount === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">No responses yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  {(["connection", "contribution"] as const).map((key) => {
                    const vals = (data.responses as MatteringResponse[]).map((r) => r[key]);
                    const a = avg(vals);
                    const dist = [1, 2, 3, 4, 5].map((v) => ({
                      v,
                      count: vals.filter((x) => x === v).length,
                    }));
                    return (
                      <div key={key} className="text-center">
                        <h3 className="font-medium text-gray-700 capitalize mb-2">{key}</h3>
                        <div className="text-4xl font-bold text-crimson">{a.toFixed(2)}</div>
                        <div className="text-sm text-gray-400 mb-3">out of 5</div>
                        <div className="space-y-1">
                          {dist.map(({ v, count }) => (
                            <div key={v} className="flex items-center gap-2 text-xs">
                              <span className="w-4 text-right text-gray-400">{v}</span>
                              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                                <div
                                  className="bg-crimson h-full rounded-full"
                                  style={{ width: vals.length > 0 ? `${(count / vals.length) * 100}%` : "0%" }}
                                />
                              </div>
                              <span className="text-gray-400 w-4">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {data.window.type === "dimensions" && (
            <>
              <h2 className="font-semibold text-gray-800 mb-4">Engagement Dimensions</h2>
              <DimensionBars responses={data.responses as Parameters<typeof DimensionBars>[0]["responses"]} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
