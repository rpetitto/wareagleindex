import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import EngagementGrid from "../components/EngagementGrid";

interface SurveyWindow {
  id: string;
  name: string;
  type: string;
  opens_at: string;
  closes_at: string;
}

interface ClassState {
  id: string;
  name: string;
  subject: string | null;
  completed: boolean;
}

export default function EngagementSurvey() {
  const { windowId } = useParams<{ windowId: string }>();
  const navigate = useNavigate();

  const [windowInfo, setWindowInfo] = useState<SurveyWindow | null>(null);
  const [classes, setClasses] = useState<ClassState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [eiValue, setEiValue] = useState<{ challenge: number; love: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/student/surveys")
      .then((r) => r.json())
      .then((groups: Array<{
        window: SurveyWindow;
        classes: Array<ClassState>;
      }>) => {
        for (const g of groups) {
          if (g.window.id === windowId) {
            setWindowInfo(g.window);
            setClasses(g.classes);
            const first = g.classes.find((c) => !c.completed);
            setSelectedId(first?.id ?? g.classes[0]?.id ?? null);
            break;
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [windowId]);

  // Reset grid when switching classes
  useEffect(() => { setEiValue(null); }, [selectedId]);

  async function handleSubmit() {
    if (!eiValue || !selectedId || !windowId || submitting) return;
    setSubmitting(true);
    const res = await fetch("/api/student/respond/engagement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surveyWindowId: windowId, classId: selectedId, ...eiValue }),
    });
    if (res.ok) {
      const updated = classes.map((c) => c.id === selectedId ? { ...c, completed: true } : c);
      setClasses(updated);
      // Auto-advance to next pending
      const next = updated.find((c) => !c.completed);
      setSelectedId(next?.id ?? selectedId);
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-warm">
        <NavBar />
        <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
      </div>
    );
  }

  const selected = classes.find((c) => c.id === selectedId);
  const pending = classes.filter((c) => !c.completed);
  const done = classes.filter((c) => c.completed);
  const allDone = classes.length > 0 && pending.length === 0;

  return (
    <div className="min-h-screen bg-warm">
      <NavBar />
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => navigate("/student")}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{windowInfo?.name ?? "Engagement Survey"}</h1>
            <p className="text-sm text-gray-400">
              {done.length} of {classes.length} completed
            </p>
          </div>
        </div>

        {allDone ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">All done!</h2>
            <p className="text-gray-500 mb-6">You've submitted responses for all your classes.</p>
            <button
              onClick={() => navigate("/student")}
              className="bg-crimson text-white px-6 py-2.5 rounded-xl font-medium hover:bg-crimson-dark transition-colors"
            >
              Back to Surveys
            </button>
          </div>
        ) : (
          <div className="flex gap-4 items-start">
            {/* Left: class list */}
            <div className="w-56 shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your Classes</p>
              </div>
              <div className="divide-y divide-gray-50">
                {classes.map((cls) => {
                  const isSelected = cls.id === selectedId;
                  return (
                    <button
                      key={cls.id}
                      onClick={() => !cls.completed && setSelectedId(cls.id)}
                      disabled={cls.completed}
                      className={`w-full text-left px-4 py-3 flex items-center gap-2 transition-colors ${
                        isSelected && !cls.completed
                          ? "bg-crimson/5 border-l-2 border-crimson"
                          : cls.completed
                          ? "opacity-50 cursor-default"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isSelected && !cls.completed ? "text-crimson" : "text-gray-800"}`}>
                          {cls.name}
                        </p>
                        {cls.subject && (
                          <p className="text-xs text-gray-400 truncate">{cls.subject}</p>
                        )}
                      </div>
                      {cls.completed ? (
                        <svg className="w-4 h-4 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : isSelected ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-crimson shrink-0" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: grid */}
            <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {selected && !selected.completed ? (
                <div className="p-6">
                  <div className="mb-4">
                    <h2 className="font-semibold text-gray-900">{selected.name}</h2>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      Click to place your dot. The horizontal axis is academic challenge; the vertical axis is love of learning.
                    </p>
                  </div>

                  <EngagementGrid value={eiValue} onChange={setEiValue} />

                  {eiValue ? (
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className={`mt-4 w-full py-3 rounded-xl font-semibold text-white transition-all ${
                        submitting ? "bg-gray-300 cursor-not-allowed" : "bg-crimson hover:bg-crimson-dark shadow-sm"
                      }`}
                    >
                      {submitting ? "Submitting…" : `Submit for ${selected.name}`}
                    </button>
                  ) : (
                    <p className="mt-4 text-center text-sm text-gray-400">
                      Click anywhere on the grid to place your response
                    </p>
                  )}
                </div>
              ) : selected?.completed ? (
                <div className="p-12 text-center text-gray-400">
                  <svg className="w-8 h-8 text-green-400 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm">Already submitted for this class.</p>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
