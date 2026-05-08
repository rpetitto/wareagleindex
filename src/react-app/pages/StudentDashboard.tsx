import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import NavBar from "../components/NavBar";
import { useAuth } from "../App";

interface SurveyClass {
  id: string;
  name: string;
  subject: string | null;
  grade_level: string | null;
  completed: boolean;
}

interface SurveyGroup {
  window: {
    id: string;
    name: string;
    type: "engagement_index" | "mattering_index" | "dimensions";
    opens_at: string;
    closes_at: string;
  };
  classes: SurveyClass[];
}

const TYPE_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  engagement_index: {
    label: "Engagement Index",
    color: "bg-green-100 text-green-800",
    desc: "Rate your challenge & love of learning",
  },
  mattering_index: {
    label: "Mattering Index",
    color: "bg-blue-100 text-blue-800",
    desc: "Rate your connection & contribution",
  },
  dimensions: {
    label: "Engagement Dimensions",
    color: "bg-purple-100 text-purple-800",
    desc: "Detailed 4-dimension survey",
  },
};

function daysLeft(closesAt: string) {
  const diff = new Date(closesAt).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Closing today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<SurveyGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/student/surveys")
      .then((r) => r.json())
      .then((data) => { setGroups(data as SurveyGroup[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const totalPending = groups.filter((g) => g.classes.some((c) => !c.completed)).length;
  const totalCompleted = groups.filter((g) => g.classes.length > 0 && g.classes.every((c) => c.completed)).length;

  return (
    <div className="min-h-screen bg-warm">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Surveys</h1>
          <p className="text-gray-500 mt-1">Hello, {user?.name?.split(" ")[0]}! Here are your active surveys.</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="text-3xl font-bold text-crimson">{totalPending}</div>
            <div className="text-sm text-gray-500 mt-1">Pending</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="text-3xl font-bold text-green-600">{totalCompleted}</div>
            <div className="text-sm text-gray-500 mt-1">Completed</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center flex flex-col items-center justify-center">
            <Link
              to="/student/history"
              className="text-sm font-medium text-crimson hover:text-crimson-dark transition-colors"
            >
              View History
            </Link>
            <div className="text-xs text-gray-400 mt-0.5">All responses</div>
          </div>
        </div>

        {loading && (
          <div className="text-center text-gray-400 py-12">Loading surveys…</div>
        )}

        {!loading && groups.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-4">✓</div>
            <h2 className="text-xl font-semibold text-gray-700">All caught up!</h2>
            <p className="text-gray-400 mt-2">No active surveys right now. Check back later.</p>
          </div>
        )}

        {groups.map((group) => {
          const meta = TYPE_LABELS[group.window.type] ?? {
            label: group.window.type,
            color: "bg-gray-100 text-gray-700",
            desc: "",
          };
          const pending = group.classes.filter((c) => !c.completed);
          const done = group.classes.filter((c) => c.completed);

          return (
            <div key={group.window.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6">
              {/* Window header */}
              <div className="px-6 py-4 border-b border-gray-50 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>
                      {meta.label}
                    </span>
                    <span className="text-xs text-orange-600 font-medium">
                      {daysLeft(group.window.closes_at)}
                    </span>
                  </div>
                  <h2 className="font-semibold text-gray-900">{group.window.name}</h2>
                  <p className="text-sm text-gray-400 mt-0.5">{meta.desc}</p>
                </div>
                <div className="text-sm text-gray-400 text-right shrink-0 ml-4">
                  {done.length}/{group.classes.length} done
                </div>
              </div>

              {/* EI: single entry point — the split-panel handles class selection */}
              {group.window.type === "engagement_index" ? (
                <div className="px-6 py-4 flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    {pending.length > 0
                      ? `${pending.length} class${pending.length !== 1 ? "es" : ""} remaining`
                      : "All classes submitted"}
                  </div>
                  {pending.length > 0 ? (
                    <Link
                      to={`/student/survey/${group.window.id}`}
                      className="flex items-center gap-2 bg-crimson text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-crimson-dark transition-colors"
                    >
                      Take Survey
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      All done
                    </div>
                  )}
                </div>
              ) : (
                /* MI / Dimensions: per-class rows */
                <div className="divide-y divide-gray-50">
                  {pending.map((cls) => (
                    <Link
                      key={cls.id}
                      to={`/student/survey/${group.window.id}/${cls.id}`}
                      className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors group"
                    >
                      <div>
                        <div className="font-medium text-gray-900 group-hover:text-crimson transition-colors">
                          {cls.name}
                        </div>
                        {cls.subject && (
                          <div className="text-sm text-gray-400">{cls.subject}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-crimson">
                        <span className="text-sm font-medium">Start</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  ))}
                  {done.map((cls) => (
                    <Link
                      key={cls.id}
                      to={`/student/survey/${group.window.id}/${cls.id}/view`}
                      className="flex items-center justify-between px-6 py-3 bg-gray-50/50 hover:bg-gray-100/50 transition-colors"
                    >
                      <div>
                        <div className="font-medium text-gray-400">{cls.name}</div>
                        {cls.subject && <div className="text-sm text-gray-300">{cls.subject}</div>}
                      </div>
                      <div className="flex items-center gap-1.5 text-green-600">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-medium">Submitted</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
