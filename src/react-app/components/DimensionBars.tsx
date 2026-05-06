interface DimResponse {
  behavioral_effort: number; behavioral_focus: number; behavioral_respect: number;
  cognitive_clarity: number; cognitive_expectations: number; cognitive_feedback: number; cognitive_challenge: number;
  emotional_known: number; emotional_cared: number; emotional_motivated: number; emotional_enjoyment: number;
  instructional_activities: number; instructional_collaboration: number; instructional_assignments: number;
  behavioral_comments: string; cognitive_comments: string; emotional_comments: string; instructional_comments: string;
}

const DIMS = [
  {
    key: "behavioral",
    label: "Behavioral",
    color: "#3b82f6",
    bg: "bg-blue-50",
    items: ["effort", "focus", "respect"],
    labels: ["Best effort", "Focus", "Respectful"],
  },
  {
    key: "cognitive",
    label: "Cognitive",
    color: "#8b5cf6",
    bg: "bg-purple-50",
    items: ["clarity", "expectations", "feedback", "challenge"],
    labels: ["Clarity", "Expectations", "Feedback", "Challenge"],
  },
  {
    key: "emotional",
    label: "Emotional",
    color: "#ec4899",
    bg: "bg-pink-50",
    items: ["known", "cared", "motivated", "enjoyment"],
    labels: ["Known", "Cared for", "Motivated", "Enjoyment"],
  },
  {
    key: "instructional",
    label: "Instructional",
    color: "#f97316",
    bg: "bg-orange-50",
    items: ["activities", "collaboration", "assignments"],
    labels: ["Activities", "Collaboration", "Assignments"],
  },
];

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function ScoreBar({ value, max = 5, color }: { value: number; max?: number; color: string }) {
  const pct = (value / max) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-sm font-semibold text-gray-700 w-8 text-right">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

export default function DimensionBars({ responses }: { responses: DimResponse[] }) {
  if (responses.length === 0) {
    return <div className="text-center text-gray-400 py-8 text-sm">No responses yet.</div>;
  }

  const comments: Record<string, string[]> = {
    behavioral: [], cognitive: [], emotional: [], instructional: [],
  };
  for (const r of responses) {
    if (r.behavioral_comments?.trim()) comments.behavioral.push(r.behavioral_comments.trim());
    if (r.cognitive_comments?.trim()) comments.cognitive.push(r.cognitive_comments.trim());
    if (r.emotional_comments?.trim()) comments.emotional.push(r.emotional_comments.trim());
    if (r.instructional_comments?.trim()) comments.instructional.push(r.instructional_comments.trim());
  }

  return (
    <div className="space-y-5">
      {DIMS.map((dim) => {
        const dimAvg = avg(
          dim.items.flatMap((item) =>
            responses.map((r) => (r as Record<string, number>)[`${dim.key}_${item}`]).filter(Boolean)
          )
        );

        return (
          <div key={dim.key} className={`rounded-xl ${dim.bg} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-800">{dim.label}</h4>
              <span className="text-sm font-bold" style={{ color: dim.color }}>
                {dimAvg.toFixed(2)}<span className="text-gray-400 font-normal">/5</span>
              </span>
            </div>
            <div className="space-y-2">
              {dim.items.map((item, idx) => {
                const vals = responses
                  .map((r) => (r as Record<string, number>)[`${dim.key}_${item}`])
                  .filter(Boolean);
                const itemAvg = avg(vals);
                return (
                  <div key={item}>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{dim.labels[idx]}</span>
                      <span>{vals.length} responses</span>
                    </div>
                    <ScoreBar value={itemAvg} color={dim.color} />
                  </div>
                );
              })}
            </div>

            {comments[dim.key].length > 0 && (
              <div className="mt-3 border-t border-black/5 pt-3">
                <p className="text-xs font-semibold text-gray-500 mb-1.5">Student Comments</p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {comments[dim.key].map((c, i) => (
                    <p key={i} className="text-xs text-gray-600 bg-white/60 rounded-lg px-2.5 py-1.5">
                      "{c}"
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
