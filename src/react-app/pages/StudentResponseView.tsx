import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import NavBar from "../components/NavBar";

interface SurveyWindow {
  id: string;
  name: string;
  type: string;
  opens_at: string;
  closes_at: string;
}

interface ClassInfo {
  id: string;
  name: string;
  subject: string | null;
  grade_level: string | null;
}

interface EIResponse {
  challenge: number;
  love: number;
  submitted_at: string;
  class_name: string | null;
  teacher_name: string | null;
}

interface MIResponse {
  connection: number;
  contribution: number;
  submitted_at: string;
  class_name: string | null;
  teacher_name: string | null;
}

interface DimResponse {
  behavioral_effort: number | null;
  behavioral_focus: number | null;
  behavioral_respect: number | null;
  cognitive_clarity: number | null;
  cognitive_expectations: number | null;
  cognitive_feedback: number | null;
  cognitive_challenge: number | null;
  emotional_known: number | null;
  emotional_cared: number | null;
  emotional_motivated: number | null;
  emotional_enjoyment: number | null;
  instructional_activities: number | null;
  instructional_collaboration: number | null;
  instructional_assignments: number | null;
  behavioral_comments: string | null;
  cognitive_comments: string | null;
  emotional_comments: string | null;
  instructional_comments: string | null;
  submitted_at: string;
  class_name: string | null;
  teacher_name: string | null;
}

interface ResponseData {
  type: string;
  window: SurveyWindow;
  class: ClassInfo | null;
  response: EIResponse | MIResponse | DimResponse;
}

function ScoreDisplay({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="text-center">
      <div className="text-4xl font-bold text-crimson">{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
      <div className="text-xs text-gray-300">out of {max}</div>
    </div>
  );
}

function DimItem({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-crimson rounded-full" style={{ width: `${(value / 5) * 100}%` }} />
        </div>
        <span className="text-sm font-semibold text-gray-800 w-4 text-right">{value}</span>
        <span className="text-xs text-gray-400">/5</span>
      </div>
    </div>
  );
}

export default function StudentResponseView() {
  const { windowId, classId } = useParams<{ windowId: string; classId: string }>();
  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/student/responses/${windowId}/${classId}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((d) => {
        if (d) { setData(d as ResponseData); setLoading(false); }
      })
      .catch(() => setLoading(false));
  }, [windowId, classId]);

  const className = data?.response && "class_name" in data.response && data.response.class_name
    ? data.response.class_name
    : data?.class?.name ?? "Unknown Class";

  return (
    <div className="min-h-screen bg-warm">
      <NavBar />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link to="/student" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Your Submission</h1>
        </div>

        {loading && <div className="text-center text-gray-400 py-12">Loading…</div>}

        {!loading && notFound && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
            No response found for this survey.
          </div>
        )}

        {!loading && data && (
          <>
            {/* Header info */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 mb-6">
              <h2 className="text-lg font-semibold text-gray-900">{className}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{data.window.name}</p>
              {"teacher_name" in data.response && data.response.teacher_name && (
                <p className="text-xs text-gray-400 mt-1">{data.response.teacher_name}</p>
              )}
            </div>

            {/* EI Response */}
            {data.type === "engagement_index" && (() => {
              const r = data.response as EIResponse;
              return (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
                  <h3 className="font-semibold text-gray-800 mb-6 text-center">Engagement Index</h3>
                  <div className="grid grid-cols-2 gap-8">
                    <ScoreDisplay label="Challenge" value={r.challenge} max={10} />
                    <ScoreDisplay label="Love" value={r.love} max={10} />
                  </div>
                </div>
              );
            })()}

            {/* MI Response */}
            {data.type === "mattering_index" && (() => {
              const r = data.response as MIResponse;
              return (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
                  <h3 className="font-semibold text-gray-800 mb-6 text-center">Mattering Index</h3>
                  <div className="grid grid-cols-2 gap-8">
                    <ScoreDisplay label="Connection" value={r.connection} max={5} />
                    <ScoreDisplay label="Contribution" value={r.contribution} max={5} />
                  </div>
                </div>
              );
            })()}

            {/* Dimensions Response */}
            {data.type === "dimensions" && (() => {
              const r = data.response as DimResponse;
              return (
                <div className="space-y-4 mb-6">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className="font-semibold text-gray-800 mb-3">Behavioral</h3>
                    <div className="divide-y divide-gray-50">
                      <DimItem label="Effort" value={r.behavioral_effort} />
                      <DimItem label="Focus" value={r.behavioral_focus} />
                      <DimItem label="Respect" value={r.behavioral_respect} />
                    </div>
                    {r.behavioral_comments && (
                      <div className="mt-3 pt-3 border-t border-gray-50">
                        <p className="text-xs text-gray-400 mb-1">Comments</p>
                        <p className="text-sm text-gray-600">{r.behavioral_comments}</p>
                      </div>
                    )}
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className="font-semibold text-gray-800 mb-3">Cognitive</h3>
                    <div className="divide-y divide-gray-50">
                      <DimItem label="Clarity" value={r.cognitive_clarity} />
                      <DimItem label="Expectations" value={r.cognitive_expectations} />
                      <DimItem label="Feedback" value={r.cognitive_feedback} />
                      <DimItem label="Challenge" value={r.cognitive_challenge} />
                    </div>
                    {r.cognitive_comments && (
                      <div className="mt-3 pt-3 border-t border-gray-50">
                        <p className="text-xs text-gray-400 mb-1">Comments</p>
                        <p className="text-sm text-gray-600">{r.cognitive_comments}</p>
                      </div>
                    )}
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className="font-semibold text-gray-800 mb-3">Emotional</h3>
                    <div className="divide-y divide-gray-50">
                      <DimItem label="Feeling Known" value={r.emotional_known} />
                      <DimItem label="Feeling Cared For" value={r.emotional_cared} />
                      <DimItem label="Motivation" value={r.emotional_motivated} />
                      <DimItem label="Enjoyment" value={r.emotional_enjoyment} />
                    </div>
                    {r.emotional_comments && (
                      <div className="mt-3 pt-3 border-t border-gray-50">
                        <p className="text-xs text-gray-400 mb-1">Comments</p>
                        <p className="text-sm text-gray-600">{r.emotional_comments}</p>
                      </div>
                    )}
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className="font-semibold text-gray-800 mb-3">Instructional</h3>
                    <div className="divide-y divide-gray-50">
                      <DimItem label="Activities" value={r.instructional_activities} />
                      <DimItem label="Collaboration" value={r.instructional_collaboration} />
                      <DimItem label="Assignments" value={r.instructional_assignments} />
                    </div>
                    {r.instructional_comments && (
                      <div className="mt-3 pt-3 border-t border-gray-50">
                        <p className="text-xs text-gray-400 mb-1">Comments</p>
                        <p className="text-sm text-gray-600">{r.instructional_comments}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Footer note */}
            <div className="text-center text-xs text-gray-400 py-4">
              This is a read-only view of your submitted response.
              {data.response.submitted_at && (
                <p className="mt-1">Submitted {new Date(data.response.submitted_at).toLocaleString()}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
