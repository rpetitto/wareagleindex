import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import EngagementGrid from "../components/EngagementGrid";

interface SurveyWindow {
  id: string;
  name: string;
  type: "engagement_index" | "mattering_index" | "dimensions";
}

interface SurveyClass {
  id: string;
  name: string;
  subject: string | null;
}

// Dimension survey question definitions
const DIMENSIONS = [
  {
    key: "behavioral",
    label: "Behavioral Engagement",
    color: "border-blue-300",
    headerColor: "bg-blue-50",
    items: [
      { key: "effort", question: "I put my best effort into this class." },
      { key: "focus", question: "I am focused and on task during this class." },
      { key: "respect", question: "I behave respectfully in this class." },
    ],
  },
  {
    key: "cognitive",
    label: "Cognitive Engagement",
    color: "border-purple-300",
    headerColor: "bg-purple-50",
    items: [
      { key: "clarity", question: "My teacher explains concepts clearly." },
      { key: "expectations", question: "I understand what I am expected to learn." },
      { key: "feedback", question: "I receive useful feedback on my work." },
      { key: "challenge", question: "I feel academically challenged in this class." },
    ],
  },
  {
    key: "emotional",
    label: "Emotional Engagement",
    color: "border-pink-300",
    headerColor: "bg-pink-50",
    items: [
      { key: "known", question: "My teacher knows me as an individual." },
      { key: "cared", question: "My teacher cares about my success." },
      { key: "motivated", question: "I feel motivated to learn in this class." },
      { key: "enjoyment", question: "I enjoy this class." },
    ],
  },
  {
    key: "instructional",
    label: "Instructional Engagement",
    color: "border-orange-300",
    headerColor: "bg-orange-50",
    items: [
      { key: "activities", question: "The mix of class activities helps me learn." },
      { key: "collaboration", question: "Group work and collaboration benefit my learning." },
      { key: "assignments", question: "The assignments help me understand the material." },
    ],
  },
];

const LIKERT = ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"];

function LikertRow({ question, value, onChange }: {
  question: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="py-3">
      <p className="text-sm text-gray-700 mb-2">{question}</p>
      <div className="flex gap-2">
        {LIKERT.map((label, i) => {
          const v = i + 1;
          return (
            <button
              key={v}
              onClick={() => onChange(v)}
              title={label}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                value === v
                  ? "bg-crimson text-white border-crimson"
                  : "bg-white text-gray-500 border-gray-200 hover:border-crimson hover:text-crimson"
              }`}
            >
              {v}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
        <span>Strongly Disagree</span>
        <span>Strongly Agree</span>
      </div>
    </div>
  );
}

function MatteringScale({ label, desc, value, onChange }: {
  label: string;
  desc: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  const OPTIONS = [
    { v: 1, label: "Not at all" },
    { v: 2, label: "A little" },
    { v: 3, label: "Somewhat" },
    { v: 4, label: "Quite a bit" },
    { v: 5, label: "Very much" },
  ];
  return (
    <div className="mb-6">
      <p className="font-medium text-gray-800 mb-1">{label}</p>
      <p className="text-sm text-gray-500 mb-3">{desc}</p>
      <div className="flex gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={`flex-1 flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
              value === o.v
                ? "border-crimson bg-crimson/5 text-crimson"
                : "border-gray-200 text-gray-600 hover:border-crimson/40"
            }`}
          >
            <span className="text-xl font-bold">{o.v}</span>
            <span className="text-xs mt-0.5 text-center leading-tight">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SurveyTaker() {
  const { windowId, classId } = useParams<{ windowId: string; classId: string }>();
  const navigate = useNavigate();

  const [surveyWindow, setSurveyWindow] = useState<SurveyWindow | null>(null);
  const [surveyClass, setSurveyClass] = useState<SurveyClass | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Engagement Index state
  const [eiValue, setEiValue] = useState<{ challenge: number; love: number } | null>(null);

  // Mattering Index state
  const [connection, setConnection] = useState<number | null>(null);
  const [contribution, setContribution] = useState<number | null>(null);

  // Dimensions state
  const [dimValues, setDimValues] = useState<Record<string, number | null>>({});
  const [dimComments, setDimComments] = useState<Record<string, string>>({
    behavioral: "", cognitive: "", emotional: "", instructional: "",
  });

  useEffect(() => {
    // Load survey info from the student surveys list
    fetch("/api/student/surveys")
      .then((r) => r.json())
      .then((groups: Array<{
        window: SurveyWindow;
        classes: Array<SurveyClass & { completed: boolean }>;
      }>) => {
        for (const g of groups) {
          if (g.window.id === windowId) {
            setSurveyWindow(g.window);
            const cls = g.classes.find((c) => c.id === classId);
            if (cls) setSurveyClass(cls);
            break;
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [windowId, classId]);

  function setDimValue(dim: string, item: string, v: number) {
    setDimValues((prev) => ({ ...prev, [`${dim}_${item}`]: v }));
  }

  function getDimValue(dim: string, item: string) {
    return dimValues[`${dim}_${item}`] ?? null;
  }

  function canSubmit() {
    if (!surveyWindow) return false;
    if (surveyWindow.type === "engagement_index") return eiValue !== null;
    if (surveyWindow.type === "mattering_index") return connection !== null && contribution !== null;
    // Dimensions: all items required
    for (const dim of DIMENSIONS) {
      for (const item of dim.items) {
        if (!dimValues[`${dim.key}_${item.key}`]) return false;
      }
    }
    return true;
  }

  async function handleSubmit() {
    if (!canSubmit() || !surveyWindow || !windowId || !classId) return;
    setSubmitting(true);

    try {
      let url: string;
      let body: Record<string, unknown>;

      if (surveyWindow.type === "engagement_index") {
        url = "/api/student/respond/engagement";
        body = { surveyWindowId: windowId, classId, ...eiValue };
      } else if (surveyWindow.type === "mattering_index") {
        url = "/api/student/respond/mattering";
        body = { surveyWindowId: windowId, classId, connection, contribution };
      } else {
        url = "/api/student/respond/dimensions";
        body = {
          surveyWindowId: windowId,
          classId,
          ...Object.fromEntries(
            DIMENSIONS.flatMap((dim) =>
              dim.items.map((item) => [`${dim.key}_${item.key}`, dimValues[`${dim.key}_${item.key}`]])
            )
          ),
          behavioral_comments: dimComments.behavioral,
          cognitive_comments: dimComments.cognitive,
          emotional_comments: dimComments.emotional,
          instructional_comments: dimComments.instructional,
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSubmitted(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-warm">
        <NavBar />
        <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
      </div>
    );
  }

  if (!surveyWindow || !surveyClass) {
    return (
      <div className="min-h-screen bg-warm">
        <NavBar />
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-500">Survey not found or already completed.</p>
          <button onClick={() => navigate("/student")} className="mt-4 text-crimson underline text-sm">
            Back to surveys
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-warm">
        <NavBar />
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Response Submitted!</h2>
          <p className="text-gray-500 mb-6">
            Your response for <strong>{surveyClass.name}</strong> has been recorded.
          </p>
          <button
            onClick={() => navigate("/student")}
            className="bg-crimson text-white px-6 py-2.5 rounded-xl font-medium hover:bg-crimson-dark transition-colors"
          >
            Back to Surveys
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm">
      <NavBar />
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <button
          onClick={() => navigate("/student")}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to surveys
        </button>

        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">{surveyWindow.name}</h1>
          <p className="text-gray-500 mt-0.5">{surveyClass.name}</p>
        </div>

        {/* ── Engagement Index ── */}
        {surveyWindow.type === "engagement_index" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              Click on the grid to show how you feel about this class. The{" "}
              <strong>horizontal axis</strong> represents academic challenge (how hard it is) and
              the <strong>vertical axis</strong> represents love of learning (how much you enjoy it).
            </p>
            <EngagementGrid value={eiValue} onChange={setEiValue} />
          </div>
        )}

        {/* ── Mattering Index ── */}
        {surveyWindow.type === "mattering_index" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              Rate how connected you feel to this class and how much you contribute to it.
            </p>
            <MatteringScale
              label="Connection"
              desc="I feel connected to this class and the people in it."
              value={connection}
              onChange={setConnection}
            />
            <MatteringScale
              label="Contribution"
              desc="I feel like I contribute meaningfully to this class."
              value={contribution}
              onChange={setContribution}
            />
          </div>
        )}

        {/* ── Dimensions Survey ── */}
        {surveyWindow.type === "dimensions" && (
          <div className="space-y-4">
            {DIMENSIONS.map((dim) => (
              <div key={dim.key} className={`bg-white rounded-2xl border-l-4 ${dim.color} shadow-sm overflow-hidden`}>
                <div className={`px-6 py-4 ${dim.headerColor}`}>
                  <h3 className="font-semibold text-gray-800">{dim.label}</h3>
                </div>
                <div className="px-6 divide-y divide-gray-50">
                  {dim.items.map((item) => (
                    <LikertRow
                      key={item.key}
                      question={item.question}
                      value={getDimValue(dim.key, item.key)}
                      onChange={(v) => setDimValue(dim.key, item.key, v)}
                    />
                  ))}
                  <div className="py-3">
                    <label className="text-sm text-gray-500 block mb-1">
                      Comments (optional)
                    </label>
                    <textarea
                      rows={2}
                      value={dimComments[dim.key]}
                      onChange={(e) =>
                        setDimComments((p) => ({ ...p, [dim.key]: e.target.value }))
                      }
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson"
                      placeholder="Any additional thoughts about this dimension?"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Submit button */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit() || submitting}
            className={`flex-1 py-3 rounded-xl font-semibold text-white transition-all ${
              canSubmit() && !submitting
                ? "bg-crimson hover:bg-crimson-dark shadow-sm"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {submitting ? "Submitting…" : "Submit Response"}
          </button>
        </div>
        {!canSubmit() && (
          <p className="text-xs text-gray-400 text-center mt-2">
            {surveyWindow.type === "engagement_index"
              ? "Click on the grid to place your response"
              : "Please answer all questions to submit"}
          </p>
        )}
      </div>
    </div>
  );
}
