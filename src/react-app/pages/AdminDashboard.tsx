import React, { useEffect, useState, useRef, useMemo } from "react";
import { Routes, Route, Link, useLocation, useNavigate, useParams, Navigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import QuadrantScatter from "../components/QuadrantScatter";
import SlideOver from "../components/SlideOver";
import TeacherOverviewCard, { type TeacherOverviewData } from "../components/TeacherOverviewCard";
import AdminDataGrid from "./AdminDataGrid";

// ─── Overview ────────────────────────────────────────────────────────────────

interface Overview {
  students: number;
  teachers: number;
  classes: number;
  surveyWindows: number;
  totalResponses: number;
  activeWindows: Array<{ id: string; name: string; type: string; opens_at: string; closes_at: string }>;
}

const TYPE_BADGE: Record<string, string> = {
  engagement_index: "bg-green-100 text-green-700",
  mattering_index: "bg-blue-100 text-blue-700",
  dimensions: "bg-purple-100 text-purple-700",
};
const TYPE_LABEL: Record<string, string> = {
  engagement_index: "Engagement Index",
  mattering_index: "Mattering Index",
  dimensions: "Dimensions",
};

interface Concern {
  survey_window_id: string;
  window_name: string;
  opens_at: string;
  class_id: string;
  class_name: string | null;
  teacher_name: string | null;
  total: number;
  anxiety_cnt: number;
  boredom_cnt: number;
  avg_c: number | null;
  avg_l: number | null;
}

function ConcernCard({ c, onClick }: { c: Concern; onClick: () => void }) {
  const concerning = c.anxiety_cnt + c.boredom_cnt;
  const pct = Math.round((concerning / c.total) * 100);
  const dominantlyAnxious = c.anxiety_cnt >= c.boredom_cnt;
  const borderColor = dominantlyAnxious ? "border-orange-400" : "border-gray-400";
  const badgeColor = dominantlyAnxious ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600";
  const label = c.anxiety_cnt > 0 && c.boredom_cnt > 0
    ? `${c.anxiety_cnt} anxious · ${c.boredom_cnt} bored`
    : c.anxiety_cnt > 0 ? `${c.anxiety_cnt} anxious` : `${c.boredom_cnt} bored`;

  return (
    <button
      onClick={onClick}
      className={`shrink-0 w-56 bg-white rounded-2xl border-2 ${borderColor} shadow-sm p-4 text-left hover:shadow-md transition-all cursor-pointer`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{c.class_name ?? "Unknown class"}</p>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${badgeColor}`}>{pct}%</span>
      </div>
      {c.teacher_name && <p className="text-xs text-gray-400 truncate mb-2">{c.teacher_name}</p>}
      <p className="text-xs text-gray-500 truncate mb-3">{c.window_name}</p>
      <div className="space-y-1">
        {c.anxiety_cnt > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
            <span className="text-xs text-gray-600">{c.anxiety_cnt} Anxiety</span>
          </div>
        )}
        {c.boredom_cnt > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
            <span className="text-xs text-gray-600">{c.boredom_cnt} Boredom</span>
          </div>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-50 flex gap-3 text-xs text-gray-400">
        <span>Challenge: <strong className="text-gray-700">{c.avg_c ?? "—"}</strong></span>
        <span>Love: <strong className="text-gray-700">{c.avg_l ?? "—"}</strong></span>
      </div>
    </button>
  );
}

function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [concerns, setConcerns] = useState<Concern[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/overview").then((r) => r.json()).then((d) => setData(d as Overview));
    fetch("/api/admin/overview/concerns").then((r) => r.json()).then((d) => setConcerns(d as Concern[]));
  }, []);

  if (!data) return <div className="text-center text-gray-400 py-12">Loading…</div>;

  const stats = [
    { label: "Students", value: data.students, color: "text-crimson", to: "/admin/users?role=student" },
    { label: "Teachers", value: data.teachers, color: "text-blue-600", to: "/admin/users?role=teacher" },
    { label: "Classes", value: data.classes, color: "text-purple-600", to: "/admin/classes" },
    { label: "Total Responses", value: data.totalResponses, color: "text-green-600", to: "/admin/surveys" },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">School Overview</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm hover:border-gray-200 hover:shadow-md transition-all block cursor-pointer">
            <div className={`text-3xl font-bold ${s.color}`}>{s.value.toLocaleString()}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </Link>
        ))}
      </div>

      {concerns.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <h3 className="font-semibold text-gray-800">Needs Attention</h3>
            <span className="text-xs text-gray-400">classes where ≥50% of responses are anxiety or boredom · last 90 days</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
            {concerns.map((c) => (
              <ConcernCard
                key={`${c.survey_window_id}-${c.class_id}`}
                c={c}
                onClick={() => setSelectedWindowId(c.survey_window_id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4">Active Survey Windows</h3>
        {data.activeWindows.length === 0 ? (
          <p className="text-gray-400 text-sm">
            No active survey windows.{" "}
            <Link to="/admin/surveys" className="text-crimson underline">Create one</Link>.
          </p>
        ) : (
          <div className="space-y-3">
            {data.activeWindows.map((w) => (
              <button
                key={w.id}
                onClick={() => setSelectedWindowId(w.id)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_BADGE[w.type] ?? "bg-gray-100 text-gray-600"}`}>
                    {TYPE_LABEL[w.type] ?? w.type}
                  </span>
                  <span className="font-medium text-gray-800 text-sm">{w.name}</span>
                </div>
                <span className="text-xs text-gray-400">
                  Closes {new Date(w.closes_at).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <SlideOver open={selectedWindowId != null} onClose={() => setSelectedWindowId(null)}>
        {selectedWindowId && (
          <SurveyDetailPanel windowId={selectedWindowId} onClose={() => setSelectedWindowId(null)} />
        )}
      </SlideOver>
    </div>
  );
}

// ─── Survey Detail Panel ──────────────────────────────────────────────────────

interface SurveyResponse {
  id: string;
  student_id: string;
  student_name: string | null;
  student_picture: string | null;
  class_id: string;
  class_name: string | null;
  teacher_name: string | null;
  challenge?: number;
  love?: number;
  connection?: number;
  contribution?: number;
  submitted_at: string;
}

interface SurveyDetail {
  window: { id: string; name: string; type: string; opens_at: string; closes_at: string };
  eligible: number;
  responses: SurveyResponse[];
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (v: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setSearch(""); return; }
    setTimeout(() => searchRef.current?.focus(), 0);
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const count = selected.size;
  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
          count > 0
            ? "bg-crimson/5 border-crimson/30 text-crimson font-medium"
            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
      >
        {label}{count > 0 ? ` (${count})` : ""}
        <svg className="w-3.5 h-3.5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[200px] max-h-72 flex flex-col">
          <div className="px-2 pt-2 pb-1 border-b border-gray-100">
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-crimson/30"
            />
          </div>
          <div className="overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">No matches</div>
            ) : (
              filtered.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(opt.value)}
                    onChange={() => {
                      const next = new Set(selected);
                      if (next.has(opt.value)) next.delete(opt.value);
                      else next.add(opt.value);
                      onChange(next);
                    }}
                    className="w-3.5 h-3.5 accent-crimson"
                  />
                  <span className="text-xs text-gray-700" title={opt.label}>{opt.label}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type Quadrant = "flow" | "comfort" | "anxiety" | "boredom";

function SurveyDetailPanel({ windowId, onClose: _onClose }: { windowId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<SurveyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStudents, setFilterStudents] = useState<Set<string>>(new Set());
  const [filterTeachers, setFilterTeachers] = useState<Set<string>>(new Set());
  const [filterCourses, setFilterCourses] = useState<Set<string>>(new Set());
  const [filterClasses, setFilterClasses] = useState<Set<string>>(new Set());
  const [activeQuadrant, setActiveQuadrant] = useState<Quadrant | null>(null);
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [submissionSearch, setSubmissionSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function reload() {
    fetch(`/api/admin/surveys/${windowId}/detail`)
      .then((r) => r.json())
      .then((d) => { setDetail(d as SurveyDetail); });
  }

  async function deleteResponse(responseId: string, type: string) {
    if (!confirm("Delete this rating? The student can re-rate this class.")) return;
    setDeletingId(responseId);
    try {
      await fetch(`/api/admin/responses/${type}/${responseId}`, { method: "DELETE" });
      reload();
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    setFilterStudents(new Set());
    setFilterTeachers(new Set());
    setFilterCourses(new Set());
    setFilterClasses(new Set());
    setActiveQuadrant(null);
    setShowSubmissions(false);
    setSubmissionSearch("");
    setSelectedStudentId(null);
    fetch(`/api/admin/surveys/${windowId}/detail`)
      .then((r) => r.json())
      .then((d) => { setDetail(d as SurveyDetail); setLoading(false); })
      .catch(() => setLoading(false));
  }, [windowId]);

  const allStudents = useMemo(() => {
    if (!detail) return [];
    const seen = new Set<string>();
    return detail.responses
      .filter((r) => { if (seen.has(r.student_id)) return false; seen.add(r.student_id); return true; })
      .map((r) => ({ value: r.student_id, label: r.student_name ?? r.student_id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [detail]);

  const allTeachers = useMemo(() => {
    if (!detail) return [];
    const seen = new Set<string>();
    return detail.responses
      .filter((r) => r.teacher_name && !seen.has(r.teacher_name) && seen.add(r.teacher_name as string))
      .map((r) => ({ value: r.teacher_name!, label: r.teacher_name! }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [detail]);

  const allCourses = useMemo(() => {
    if (!detail) return [];
    const seen = new Set<string>();
    return detail.responses
      .filter((r) => r.class_name && !seen.has(r.class_name) && seen.add(r.class_name as string))
      .map((r) => ({ value: r.class_name!, label: r.class_name! }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [detail]);

  const allClasses = useMemo(() => {
    if (!detail) return [];
    const seen = new Set<string>();
    return detail.responses
      .filter((r) => !seen.has(r.class_id) && seen.add(r.class_id))
      .map((r) => ({ value: r.class_id, label: r.class_name ?? r.class_id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [detail]);

  const filtered = useMemo(() => {
    if (!detail) return [];
    return detail.responses.filter((r) => {
      if (filterStudents.size > 0 && !filterStudents.has(r.student_id)) return false;
      if (filterTeachers.size > 0 && !filterTeachers.has(r.teacher_name ?? "")) return false;
      if (filterCourses.size > 0 && !filterCourses.has(r.class_name ?? "")) return false;
      if (filterClasses.size > 0 && !filterClasses.has(r.class_id)) return false;
      if (activeQuadrant && r.challenge != null && r.love != null) {
        const highC = r.challenge > 5;
        const highL = r.love > 5;
        if (activeQuadrant === "flow" && !(highC && highL)) return false;
        if (activeQuadrant === "comfort" && !(!highC && highL)) return false;
        if (activeQuadrant === "anxiety" && !(highC && !highL)) return false;
        if (activeQuadrant === "boredom" && !(!highC && !highL)) return false;
      }
      return true;
    });
  }, [detail, filterStudents, filterTeachers, filterCourses, filterClasses, activeQuadrant]);

  const eiPoints = useMemo(
    () => filtered.filter((r) => r.challenge != null && r.love != null).map((r) => ({ challenge: r.challenge!, love: r.love! })),
    [filtered]
  );

  const avgChallenge = eiPoints.length > 0 ? eiPoints.reduce((s, r) => s + r.challenge, 0) / eiPoints.length : null;
  const avgLove = eiPoints.length > 0 ? eiPoints.reduce((s, r) => s + r.love, 0) / eiPoints.length : null;

  const miFiltered = useMemo(() => filtered.filter((r) => r.connection != null && r.contribution != null), [filtered]);
  const avgConnection = miFiltered.length > 0 ? miFiltered.reduce((s, r) => s + r.connection!, 0) / miFiltered.length : null;
  const avgContribution = miFiltered.length > 0 ? miFiltered.reduce((s, r) => s + r.contribution!, 0) / miFiltered.length : null;

  const anyFilterActive = filterStudents.size > 0 || filterTeachers.size > 0 || filterCourses.size > 0 || filterClasses.size > 0 || activeQuadrant != null;

  const responses = detail?.responses ?? [];

  const submittedStudents = useMemo(() => new Set(responses.map((r) => r.student_id)).size, [responses]);

  const byStudent = useMemo(() => {
    const map = new Map<string, { name: string | null; picture: string | null; ratings: SurveyResponse[] }>();
    for (const r of responses) {
      if (!map.has(r.student_id)) map.set(r.student_id, { name: r.student_name, picture: r.student_picture, ratings: [] });
      map.get(r.student_id)!.ratings.push(r);
    }
    return Array.from(map.entries())
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [responses]);

  function clearAll() {
    setFilterStudents(new Set());
    setFilterTeachers(new Set());
    setFilterCourses(new Set());
    setFilterClasses(new Set());
    setActiveQuadrant(null);
  }

  if (loading) return <div className="text-center text-gray-400 py-12">Loading…</div>;
  if (!detail) return <div className="text-center text-gray-400 py-12">Survey not found.</div>;

  const { window: win, eligible } = detail;
  const pct = eligible > 0 ? Math.round((submittedStudents / eligible) * 100) : 0;
  const isEI = win.type === "engagement_index";
  const isMI = win.type === "mattering_index";

  // Quadrant counts from all responses (not filtered), using mid=5
  const qCounts = { flow: 0, comfort: 0, anxiety: 0, boredom: 0 };
  for (const r of responses) {
    if (r.challenge == null || r.love == null) continue;
    if (r.challenge > 5 && r.love > 5) qCounts.flow++;
    else if (r.challenge <= 5 && r.love > 5) qCounts.comfort++;
    else if (r.challenge > 5 && r.love <= 5) qCounts.anxiety++;
    else qCounts.boredom++;
  }

  const quadrantTiles: { key: Quadrant; label: string; count: number; colors: string; activeColors: string }[] = [
    { key: "flow", label: "Flow", count: qCounts.flow, colors: "border-l-4 border-l-green-400 bg-green-50", activeColors: "border-l-4 border-l-green-600 bg-green-100 ring-2 ring-green-400" },
    { key: "comfort", label: "Comfort", count: qCounts.comfort, colors: "border-l-4 border-l-blue-400 bg-blue-50", activeColors: "border-l-4 border-l-blue-600 bg-blue-100 ring-2 ring-blue-400" },
    { key: "anxiety", label: "Anxiety", count: qCounts.anxiety, colors: "border-l-4 border-l-orange-400 bg-orange-50", activeColors: "border-l-4 border-l-orange-600 bg-orange-100 ring-2 ring-orange-400" },
    { key: "boredom", label: "Boredom", count: qCounts.boredom, colors: "border-l-4 border-l-gray-300 bg-gray-50", activeColors: "border-l-4 border-l-gray-500 bg-gray-100 ring-2 ring-gray-400" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_BADGE[win.type] ?? "bg-gray-100 text-gray-600"}`}>
            {TYPE_LABEL[win.type] ?? win.type}
          </span>
          <h2 className="text-lg font-bold text-gray-900">{win.name}</h2>
        </div>
        <p className="text-xs text-gray-400">
          {new Date(win.opens_at).toLocaleString()} → {new Date(win.closes_at).toLocaleString()}
        </p>
      </div>

      {/* Completion bar — click to view submissions */}
      <button
        type="button"
        onClick={() => { setShowSubmissions((v) => !v); setSelectedStudentId(null); setSubmissionSearch(""); }}
        className="w-full bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-left hover:border-crimson/40 hover:shadow transition"
      >
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            <strong className="text-gray-900">{submittedStudents}</strong> of <strong className="text-gray-900">{eligible}</strong> students submitted
          </span>
          <span className="text-sm font-bold text-crimson flex items-center gap-2">
            {pct}%
            <span className="text-gray-400 text-xs font-normal">{showSubmissions ? "▴" : "▾"}</span>
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-crimson rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </button>

      {/* Submissions panel */}
      {showSubmissions && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {selectedStudentId ? (() => {
            const student = byStudent.find((s) => s.id === selectedStudentId);
            if (!student) return null;
            const eiPoints = student.ratings
              .filter((r) => r.challenge != null && r.love != null)
              .map((r) => ({ challenge: r.challenge!, love: r.love! }));
            return (
              <>
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
                  <button onClick={() => setSelectedStudentId(null)} className="text-xs text-gray-500 hover:text-gray-900 transition">← Back</button>
                  {student.picture ? (
                    <img src={student.picture} className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-crimson text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {student.name?.charAt(0) ?? "?"}
                    </div>
                  )}
                  <span className="font-semibold text-sm text-gray-900">{student.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{student.ratings.length} ratings</span>
                </div>
                {isEI && eiPoints.length > 0 && (
                  <div className="px-4 pt-4 pb-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Aggregate</p>
                    <QuadrantScatter responses={eiPoints} />
                  </div>
                )}
                <div className="divide-y divide-gray-50">
                  {student.ratings.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                      {isEI && r.challenge != null && r.love != null ? (
                        <MiniDot challenge={r.challenge} love={r.love} />
                      ) : (
                        <div className="w-20 h-20 shrink-0 bg-gray-50 rounded-lg flex items-center justify-center text-xs text-gray-400">
                          {isMI ? `${r.connection} / ${r.contribution}` : "—"}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">{r.class_name ?? "—"}</div>
                        {r.teacher_name && <div className="text-xs text-gray-500">{r.teacher_name}</div>}
                        {isEI && r.challenge != null && (
                          <div className="text-xs text-gray-400 mt-0.5">Challenge: {r.challenge} · Love: {r.love}</div>
                        )}
                      </div>
                      <button
                        onClick={() => deleteResponse(r.id, win.type)}
                        disabled={deletingId === r.id}
                        className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition disabled:opacity-40 shrink-0"
                      >
                        {deletingId === r.id ? "…" : "Delete"}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            );
          })() : (
            <>
              <div className="px-4 py-3 border-b border-gray-100">
                <input
                  type="text"
                  placeholder="Search students…"
                  value={submissionSearch}
                  onChange={(e) => setSubmissionSearch(e.target.value)}
                  className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-crimson/30"
                  autoFocus
                />
              </div>
              {byStudent.length === 0 ? (
                <div className="text-center text-gray-400 py-8 text-sm">No submissions yet.</div>
              ) : (
                <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
                  {byStudent
                    .filter((s) => !submissionSearch || (s.name ?? "").toLowerCase().includes(submissionSearch.toLowerCase()))
                    .map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedStudentId(s.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition text-left"
                      >
                        {s.picture ? (
                          <img src={s.picture} className="w-8 h-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-crimson text-white flex items-center justify-center text-xs font-bold shrink-0">
                            {s.name?.charAt(0) ?? "?"}
                          </div>
                        )}
                        <span className="flex-1 text-sm font-medium text-gray-900">{s.name ?? "Unknown"}</span>
                        <span className="text-xs text-gray-400">{s.ratings.length} class{s.ratings.length !== 1 ? "es" : ""} rated</span>
                        <span className="text-gray-300 text-xs">›</span>
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <MultiSelect label="Teacher" options={allTeachers} selected={filterTeachers} onChange={setFilterTeachers} />
        <MultiSelect label="Course" options={allCourses} selected={filterCourses} onChange={setFilterCourses} />
        <MultiSelect label="Class" options={allClasses} selected={filterClasses} onChange={setFilterClasses} />
        <MultiSelect label="Student" options={allStudents} selected={filterStudents} onChange={setFilterStudents} />
        {anyFilterActive && (
          <button onClick={clearAll} className="text-xs text-gray-500 hover:text-crimson transition-colors underline">
            Clear filters
          </button>
        )}
      </div>

      {/* Scatter (EI only) */}
      {isEI && eiPoints.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Engagement Scatter</p>
          <QuadrantScatter responses={eiPoints} />
        </div>
      )}

      {/* Averages */}
      {(isEI || isMI) && (
        <div className="grid grid-cols-2 gap-3">
          {isEI && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">EI Averages</p>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5"><span>Challenge</span><span>/ 10</span></div>
                  <MetricBar value={avgChallenge} max={10} color="bg-green-400" />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5"><span>Love</span><span>/ 10</span></div>
                  <MetricBar value={avgLove} max={10} color="bg-green-400" />
                </div>
              </div>
            </div>
          )}
          {isMI && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">MI Averages</p>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5"><span>Connection</span><span>/ 5</span></div>
                  <MetricBar value={avgConnection} max={5} color="bg-blue-400" />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5"><span>Contribution</span><span>/ 5</span></div>
                  <MetricBar value={avgContribution} max={5} color="bg-blue-400" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Response count note */}
      <p className="text-xs text-gray-400">
        {filtered.length} response{filtered.length !== 1 ? "s" : ""} shown
      </p>
    </div>
  );
}

// ─── Survey Manager ───────────────────────────────────────────────────────────

interface SurveyWindow {
  id: string;
  name: string;
  type: string;
  opens_at: string;
  closes_at: string;
  target_all: number;
  created_at: string;
  created_by_name: string;
}

function SurveyForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<SurveyWindow>;
  onSave: (data: { name: string; type: string; opens_at: string; closes_at: string; target_all: boolean }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "engagement_index");
  const [opensAt, setOpensAt] = useState(initial?.opens_at?.slice(0, 16) ?? "");
  const [closesAt, setClosesAt] = useState(initial?.closes_at?.slice(0, 16) ?? "");

  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Survey Name</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crimson/30"
            placeholder="e.g. Fall 2025 Check-In #1"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Type</label>
          <select
            value={type} onChange={(e) => setType(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crimson/30"
            disabled={!!initial?.id}
          >
            <option value="engagement_index">Engagement Index</option>
            <option value="mattering_index">Mattering Index</option>
            <option value="dimensions">Engagement Dimensions</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Opens At</label>
          <input
            type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crimson/30"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Closes At</label>
          <input
            type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crimson/30"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave({ name, type, opens_at: opensAt, closes_at: closesAt, target_all: true })}
          disabled={!name || !opensAt || !closesAt}
          className="bg-crimson text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-crimson-dark transition-colors disabled:opacity-40"
        >
          {initial?.id ? "Save Changes" : "Create Survey"}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-200 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

function SurveysPage() {
  const [surveys, setSurveys] = useState<SurveyWindow[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/surveys").then((r) => r.json()).then((d) => setSurveys(d as SurveyWindow[]));
  }

  useEffect(load, []);

  async function handleCreate(data: Parameters<typeof SurveyForm>[0]["onSave"] extends (d: infer D) => void ? D : never) {
    await fetch("/api/admin/surveys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setCreating(false);
    load();
  }

  async function handleUpdate(id: string, data: { name: string; opens_at: string; closes_at: string }) {
    await fetch(`/api/admin/surveys/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditingId(null);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this survey window? All responses will also be removed.")) return;
    await fetch(`/api/admin/surveys/${id}`, { method: "DELETE" });
    load();
  }

  function windowStatus(w: SurveyWindow) {
    const now = Date.now();
    const opens = new Date(w.opens_at).getTime();
    const closes = new Date(w.closes_at).getTime();
    if (now < opens) return { label: "Upcoming", color: "text-yellow-600 bg-yellow-50" };
    if (now > closes) return { label: "Closed", color: "text-gray-500 bg-gray-100" };
    return { label: "Active", color: "text-green-700 bg-green-100" };
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Survey Windows</h2>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 bg-crimson text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-crimson-dark transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Survey
          </button>
        )}
      </div>

      {creating && (
        <div className="mb-4">
          <SurveyForm onSave={handleCreate} onCancel={() => setCreating(false)} />
        </div>
      )}

      <div className="space-y-3">
        {surveys.length === 0 && !creating && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
            No survey windows yet. Create one to get started.
          </div>
        )}
        {surveys.map((w) => {
          const status = windowStatus(w);
          return (
            <div key={w.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden cursor-pointer hover:border-gray-200 transition-colors" onClick={() => { if (editingId !== w.id) setSelectedWindowId(w.id); }}>
              {editingId === w.id ? (
                <div className="p-4">
                  <SurveyForm
                    initial={w}
                    onSave={(d) => handleUpdate(w.id, d)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-4 px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_BADGE[w.type] ?? "bg-gray-100 text-gray-600"}`}>
                    {TYPE_LABEL[w.type] ?? w.type}
                  </span>
                  <button
                    className="flex-1 min-w-0 text-left hover:text-crimson transition-colors"
                    onClick={() => setSelectedWindowId(w.id)}
                  >
                    <p className="font-medium text-gray-900 truncate">{w.name}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(w.opens_at).toLocaleString()} → {new Date(w.closes_at).toLocaleString()}
                    </p>
                  </button>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.color}`}>
                    {status.label}
                  </span>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingId(w.id); }}
                      className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(w.id); }}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <SlideOver open={selectedWindowId != null} onClose={() => setSelectedWindowId(null)}>
        {selectedWindowId && (
          <SurveyDetailPanel windowId={selectedWindowId} onClose={() => setSelectedWindowId(null)} />
        )}
      </SlideOver>
    </div>
  );
}

// ─── Users ────────────────────────────────────────────────────────────────────

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  picture: string | null;
  veracross_id: string | null;
}

function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  function load(s: string, r: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (s) params.set("search", s);
    if (r) params.set("role", r);
    fetch(`/api/admin/users?${params}`)
      .then((res) => res.json())
      .then((d) => { setUsers(d as User[]); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load("", ""); }, []);

  async function setRole(userId: string, role: string) {
    await fetch(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    load(search, roleFilter);
  }

  const ROLE_COLORS: Record<string, string> = {
    admin: "bg-crimson/10 text-crimson",
    teacher: "bg-blue-100 text-blue-700",
    student: "bg-gray-100 text-gray-600",
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-4">Users</h2>
      <div className="flex gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(search, roleFilter)}
          placeholder="Search name or email…"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crimson/30"
        />
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); load(search, e.target.value); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crimson/30"
        >
          <option value="">All roles</option>
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
          <option value="admin">Admins</option>
        </select>
        <button
          onClick={() => load(search, roleFilter)}
          className="bg-crimson text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-crimson-dark transition-colors"
        >
          Search
        </button>
      </div>

      {loading && <div className="text-center text-gray-400 py-8">Loading…</div>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {users.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-400 text-sm">No users found.</div>
        )}
        {users.map((u, i) => (
          <div
            key={u.id}
            className={`flex items-center gap-3 px-4 py-3 ${i < users.length - 1 ? "border-b border-gray-50" : ""}`}
          >
            {u.picture ? (
              <img src={u.picture} alt={u.name} className="w-8 h-8 rounded-full object-cover object-top shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                {u.name[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <button
                onClick={() => setSelectedUserId(u.id)}
                className="font-medium text-gray-900 text-sm truncate hover:text-crimson transition-colors cursor-pointer block text-left w-full"
              >
                {u.name}
              </button>
              <p className="text-xs text-gray-400 truncate">{u.email}</p>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${ROLE_COLORS[u.role] ?? "bg-gray-100"}`}>
              {u.role}
            </span>
            <select
              value={u.role}
              onChange={(e) => setRole(u.id, e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-crimson/30 shrink-0"
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        ))}
      </div>

      <SlideOver open={selectedUserId != null} onClose={() => setSelectedUserId(null)}>
        {selectedUserId && (
          <UserProfileContent userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
        )}
      </SlideOver>
    </div>
  );
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

type Phase = "teachers" | "students" | "enrollments";

interface SyncLog {
  id: string;
  ran_at: string;
  status: string;
  students: number | null;
  teachers: number | null;
  classes: number | null;
  enrollments: number | null;
  teacher_assignments: number | null;
  error_message: string | null;
  duration_ms: number | null;
  phases: string | null;
}

const ALL_PHASES: { key: Phase; label: string }[] = [
  { key: "teachers", label: "Teachers" },
  { key: "students", label: "Students" },
  { key: "enrollments", label: "Classes & Enrollments" },
];

function phasesOf(log: SyncLog): Phase[] {
  if (!log.phases) return ["teachers", "students", "enrollments"];
  try {
    return JSON.parse(log.phases) as Phase[];
  } catch {
    return ["teachers", "students", "enrollments"];
  }
}

function phaseDone(log: SyncLog, phase: Phase): boolean {
  if (phase === "teachers") return log.teachers != null;
  if (phase === "students") return log.students != null;
  return log.enrollments != null; // enrollments phase populates classes+enrollments+teacher_assignments together
}

function PhaseProgress({ log }: { log: SyncLog }) {
  const phases = phasesOf(log);
  return (
    <div className="space-y-2">
      {phases.map((p) => {
        const def = ALL_PHASES.find((x) => x.key === p)!;
        const done = phaseDone(log, p);
        const value =
          p === "teachers" ? log.teachers
            : p === "students" ? log.students
            : log.enrollments;
        return (
          <div key={p} className="flex items-center gap-3">
            <span className="w-44 text-xs text-gray-600">{def.label}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${done ? "bg-green-500 w-full" : log.status === "running" ? "bg-crimson w-1/3 animate-pulse" : "bg-gray-200 w-0"}`}
              />
            </div>
            <span className="w-20 text-right text-xs font-medium text-gray-700">
              {done ? `${value ?? 0}` : log.status === "running" ? "…" : "—"}
            </span>
          </div>
        );
      })}
      {phases.includes("enrollments") && phaseDone(log, "enrollments") && (
        <div className="flex flex-wrap gap-4 pt-2 text-xs text-gray-500">
          <span>{log.classes ?? 0} classes</span>
          <span>{log.teacher_assignments ?? 0} teacher links</span>
        </div>
      )}
    </div>
  );
}

function SyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [selected, setSelected] = useState<Set<Phase>>(new Set(["teachers", "students", "enrollments"]));

  function loadLogs() {
    return fetch("/api/admin/sync/logs")
      .then((r) => r.json())
      .then((d) => {
        const rows = d as SyncLog[];
        setLogs(rows);
        setLogsLoading(false);
        setSyncing(rows.some((r) => r.status === "running"));
      })
      .catch(() => setLogsLoading(false));
  }

  // Poll every 2s while a 'running' entry exists for snappier progress updates
  useEffect(() => {
    loadLogs();
    const id = setInterval(loadLogs, 2000);
    return () => clearInterval(id);
  }, []);

  function togglePhase(p: Phase) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  async function runSync() {
    if (selected.size === 0) return;
    setSyncing(true);
    await fetch("/api/admin/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phases: [...selected] }),
    }).catch(() => {});
    loadLogs();
  }

  async function cancelSync() {
    if (!confirm("Mark all running syncs as cancelled? This won't actually stop in-flight Veracross requests, but will let you start a new sync.")) return;
    await fetch("/api/admin/sync/cancel", { method: "POST" }).catch(() => {});
    loadLogs();
  }

  function fmt(ms: number | null) {
    if (ms == null) return "";
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  const allChecked = selected.size === ALL_PHASES.length;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Veracross Sync</h2>
        <p className="text-gray-500 text-sm mt-1">
          Choose what to sync. Each runs as its own background job — pick any combination.
        </p>
      </div>

      {/* Phase selection + run controls */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-gray-700">What to sync</span>
          <button
            onClick={() => setSelected(allChecked ? new Set() : new Set(ALL_PHASES.map((p) => p.key)))}
            className="text-xs text-crimson hover:text-crimson-dark font-medium"
          >
            {allChecked ? "Clear all" : "Select all"}
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-2 mb-5">
          {ALL_PHASES.map((p) => {
            const checked = selected.has(p.key);
            return (
              <label
                key={p.key}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  checked ? "bg-crimson/5 border-crimson/30" : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePhase(p.key)}
                  disabled={syncing}
                  className="w-4 h-4 accent-crimson"
                />
                <span className={`text-sm font-medium ${checked ? "text-gray-900" : "text-gray-600"}`}>
                  {p.label}
                </span>
              </label>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runSync}
            disabled={syncing || selected.size === 0}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white text-sm transition-all ${
              syncing || selected.size === 0
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-crimson hover:bg-crimson-dark shadow-sm"
            }`}
          >
            {syncing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Syncing…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {selected.size === ALL_PHASES.length ? "Sync All" : `Sync ${selected.size}`}
              </>
            )}
          </button>
          {syncing && (
            <button
              onClick={cancelSync}
              className="px-4 py-2.5 rounded-xl font-semibold text-sm bg-white text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm">Sync History</h3>
          <span className="text-xs text-gray-400">Last 20 runs</span>
        </div>

        {logsLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No syncs run yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {logs.map((log) => (
              <div key={log.id} className="px-5 py-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    log.status === "ok" ? "bg-green-100 text-green-700"
                    : log.status === "running" ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
                  }`}>
                    {log.status === "ok" ? (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : log.status === "running" ? (
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    {log.status === "ok" ? "Success" : log.status === "running" ? "Running…" : "Failed"}
                  </span>
                  <span className="text-sm text-gray-700">
                    {new Date(log.ran_at + "Z").toLocaleString()}
                  </span>
                  {log.duration_ms != null && (
                    <span className="text-xs text-gray-400 ml-auto">{fmt(log.duration_ms)}</span>
                  )}
                </div>

                {log.status === "error" && log.error_message ? (
                  <p className="text-sm text-red-600 font-mono bg-red-50 rounded-lg px-3 py-2">
                    {log.error_message}
                  </p>
                ) : (
                  <PhaseProgress log={log} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── User Profile ────────────────────────────────────────────────────────────

interface UserResponse {
  type: string;
  window_id: string;
  window_name: string;
  opens_at: string;
  submitted_at: string;
  // EI
  challenge?: number;
  love?: number;
  // MI
  connection?: number;
  contribution?: number;
  // Dimensions
  behavioral_effort?: number;
  behavioral_focus?: number;
  behavioral_respect?: number;
  cognitive_clarity?: number;
  cognitive_expectations?: number;
  cognitive_feedback?: number;
  cognitive_challenge?: number;
  emotional_known?: number;
  emotional_cared?: number;
  emotional_motivated?: number;
  emotional_enjoyment?: number;
  instructional_activities?: number;
  instructional_collaboration?: number;
  instructional_assignments?: number;
}

interface UserClass {
  id: string;
  name: string;
  grade_level: string | null;
  primary_teacher_name: string | null;
  responses: UserResponse[];
}

interface TaughtClass {
  id: string;
  name: string;
  grade_level: string | null;
  primary_teacher_name: string | null;
  student_count: number;
}

interface UserProfileData {
  profile: { id: string; name: string; email: string; picture: string | null; veracross_id: string | null; role: string; created_at: string };
  classes: UserClass[];
  teaches: TaughtClass[];
  stats?: { pending: number; answered: number; flagged: number; pendingWindows?: Array<{ id: string; name: string; opens_at: string; closes_at: string }> };
}

function syStartFront(): string {
  const now = new Date();
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-08-01`;
}

function MiniScatterAdmin({ points, size = 80, single = false }: { points: { challenge: number; love: number }[]; size?: number; single?: boolean }) {
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

const ROLE_PROFILE_COLORS: Record<string, string> = {
  admin: "bg-crimson/10 text-crimson",
  teacher: "bg-blue-100 text-blue-700",
  student: "bg-gray-100 text-gray-600",
};

function UserProfileContent({ userId, onClose }: { userId: string; onClose?: () => void }) {
  const navigate = useNavigate();
  const [data, setData] = useState<UserProfileData | null>(null);
  const [overview, setOverview] = useState<TeacherOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillClassId, setDrillClassId] = useState<string | null>(null);
  const [showClassList, setShowClassList] = useState(false);
  const [activeTab, setActiveTab] = useState<"recent" | "ytd" | "lifetime">("recent");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [activeTile, setActiveTile] = useState<"pending" | "answered" | "flagged" | null>(null);
  const [tileWindowId, setTileWindowId] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setDrillClassId(null);
    setShowClassList(false);
    setActiveTab("recent");
    setShowBreakdown(false);
    setActiveTile(null);
    setTileWindowId(null);
    setGeneratingReport(false);
    setReportUrl(null);
    setReportError(null);
    fetch(`/api/admin/users/${userId}/profile`)
      .then((r) => r.json())
      .then((d) => {
        const profile = d as UserProfileData;
        setData(profile);
        setLoading(false);
        if (profile?.profile?.role === "teacher" || profile?.profile?.role === "admin") {
          fetch(`/api/admin/users/${userId}/overview`)
            .then((r) => r.json())
            .then((ov) => setOverview(ov as TeacherOverviewData))
            .catch(() => {});
        }
      })
      .catch(() => setLoading(false));
  }, [userId]);

  // EI windows for the student, sorted newest first
  const eiWindows = useMemo(() => {
    if (!data) return [];
    type Rating = { class_id: string; class_name: string; teacher_name: string | null; challenge: number; love: number };
    const map = new Map<string, { window_id: string; window_name: string; opens_at: string; ratings: Rating[] }>();
    for (const cls of data.classes) {
      for (const r of cls.responses) {
        if (r.type !== "engagement_index" || r.challenge == null || r.love == null) continue;
        if (!map.has(r.window_id)) {
          map.set(r.window_id, { window_id: r.window_id, window_name: r.window_name, opens_at: r.opens_at, ratings: [] });
        }
        map.get(r.window_id)!.ratings.push({
          class_id: cls.id,
          class_name: cls.name,
          teacher_name: cls.primary_teacher_name,
          challenge: r.challenge,
          love: r.love,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.opens_at.localeCompare(a.opens_at));
  }, [data]);

  if (loading) return <div className="text-center text-gray-400 py-12">Loading…</div>;
  if (!data?.profile) return <div className="text-center text-gray-400 py-12">User not found.</div>;

  const { profile, classes, teaches, stats } = data;
  const isTeacher = profile.role === "teacher" || profile.role === "admin";

  // Tab data
  const syStart = syStartFront();
  const recentWindow = eiWindows[0];
  const tabWindows =
    activeTab === "recent" ? (recentWindow ? [recentWindow] : []) :
    activeTab === "ytd" ? eiWindows.filter((w) => w.opens_at >= syStart) :
    eiWindows;
  const tabPoints = tabWindows.flatMap((w) => w.ratings.map((r) => ({ challenge: r.challenge, love: r.love })));

  /* ── Drilled into a class ── */
  if (drillClassId) {
    return (
      <div>
        <button
          onClick={() => setDrillClassId(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to {profile.name}
        </button>
        <AdminClassDetailContent classId={drillClassId} onClose={() => setDrillClassId(null)} />
      </div>
    );
  }

  return (
    <div>
      {!onClose && (
        <button
          onClick={() => navigate("/admin/users")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Users
        </button>
      )}

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
        <div className="px-6 py-5 flex items-center gap-4">
          {profile.picture ? (
            <img src={profile.picture} alt={profile.name} className="w-14 h-14 rounded-full object-cover object-top shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-xl font-bold text-gray-500 shrink-0">
              {profile.name[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">{profile.name}</h2>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_PROFILE_COLORS[profile.role] ?? "bg-gray-100"}`}>
                {profile.role}
              </span>
            </div>
            <p className="text-sm text-gray-400">{profile.email}</p>
            {profile.veracross_id && (
              <p className="text-xs text-gray-300 mt-0.5">VC #{profile.veracross_id}</p>
            )}
          </div>
          <button
            onClick={() => setShowClassList((v) => !v)}
            className="text-right shrink-0 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="text-2xl font-bold text-crimson flex items-center gap-1.5 justify-end">
              {isTeacher ? teaches.length : classes.length}
              <svg className={`w-4 h-4 text-gray-300 transition-transform ${showClassList ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <div className="text-xs text-gray-400">
              {isTeacher ? "classes taught" : "enrolled classes"}
            </div>
          </button>
        </div>
        {showClassList && (
          <div className="border-t border-gray-100 divide-y divide-gray-50 max-h-80 overflow-y-auto">
            {(isTeacher ? teaches : classes).length === 0 ? (
              <div className="px-6 py-4 text-sm text-gray-400 text-center">No classes.</div>
            ) : isTeacher ? (
              teaches.map((cls) => (
                <button
                  key={cls.id}
                  onClick={() => setDrillClassId(cls.id)}
                  className="w-full px-6 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">{cls.name}</p>
                    {cls.grade_level && <p className="text-xs text-gray-400">Grade {cls.grade_level}</p>}
                  </div>
                  <span className="text-xs text-gray-400">{cls.student_count} students</span>
                  <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))
            ) : (
              classes.map((cls) => (
                <button
                  key={cls.id}
                  onClick={() => setDrillClassId(cls.id)}
                  className="w-full px-6 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">{cls.name}</p>
                    <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                      {cls.primary_teacher_name && <span>{cls.primary_teacher_name}</span>}
                      {cls.grade_level && <span>· Grade {cls.grade_level}</span>}
                    </div>
                  </div>
                  <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Teacher view: classes they teach */}
      {isTeacher && (
        teaches.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
            {profile.role === "admin"
              ? "Administrator account. No classes assigned."
              : "No classes assigned. Classes are linked from Veracross during sync."}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <h3 className="font-semibold text-gray-800 text-sm">Classes Taught</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {teaches.map((cls) => (
                <button
                  key={cls.id}
                  onClick={() => setDrillClassId(cls.id)}
                  className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate hover:text-crimson transition-colors">
                      {cls.name}
                    </p>
                    {cls.grade_level && (
                      <p className="text-xs text-gray-400">Grade {cls.grade_level}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {cls.student_count} students
                  </div>
                  <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )
      )}

      {/* Teacher overview card */}
      {isTeacher && (
        <div className="mt-4">
          <TeacherOverviewCard overview={overview} title={`This School Year — ${profile.name}'s Classes`} showEmpty={true} />
        </div>
      )}

      {/* Student view */}
      {!isTeacher && (
        <>
          {/* Generate Report button */}
          <div className="mb-4 flex items-center gap-3">
            {reportUrl ? (
              <a
                href={reportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-crimson text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-crimson-dark transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View Report
              </a>
            ) : (
              <button
                onClick={async () => {
                  setGeneratingReport(true);
                  setReportError(null);
                  try {
                    const r = await fetch(`/api/admin/users/${userId}/engagement-report`, { method: "POST" });
                    const d = await r.json() as { doc_url?: string; pdf_url?: string; error?: string };
                    if (d.doc_url) setReportUrl(d.doc_url);
                    else if (d.pdf_url) setReportUrl(d.pdf_url);
                    else setReportError(d.error ?? "Unknown error");
                  } catch (e) {
                    setReportError(String(e));
                  } finally {
                    setGeneratingReport(false);
                  }
                }}
                disabled={generatingReport}
                className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generatingReport ? (
                  <>
                    <svg className="w-4 h-4 animate-spin text-crimson" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Generating…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-crimson" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Generate Report
                  </>
                )}
              </button>
            )}
          </div>

          {reportError && (
            <p className="text-xs text-red-600 mt-1">{reportError}</p>
          )}

          {/* Big number tiles — clickable */}
          {(() => {
            const tiles = [
              { key: "pending" as const, count: stats?.pending ?? 0, label: "Pending", color: "text-orange-600", activeRing: "ring-orange-300" },
              { key: "answered" as const, count: stats?.answered ?? 0, label: "Answered", color: "text-green-600", activeRing: "ring-green-300" },
              { key: "flagged" as const, count: stats?.flagged ?? 0, label: "Flagged", color: "text-red-600", activeRing: "ring-red-300" },
            ];
            return (
              <div className="grid grid-cols-3 gap-3 mb-4">
                {tiles.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => { setActiveTile(activeTile === t.key ? null : t.key); setTileWindowId(null); }}
                    className={`bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-5 text-center hover:shadow-md transition-all cursor-pointer ${activeTile === t.key ? `ring-2 ${t.activeRing}` : ""}`}
                  >
                    <div className={`text-3xl font-bold ${t.color}`}>{t.count}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{t.label}</div>
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Tile drilldown: survey list */}
          {activeTile && !tileWindowId && (() => {
            const flaggedWindowIds = new Set(
              eiWindows.filter((w) => w.ratings.some((r) => r.love <= 3)).map((w) => w.window_id)
            );
            const listWindows =
              activeTile === "pending"
                ? (stats?.pendingWindows ?? []).map((w) => ({ window_id: w.id, window_name: w.name, opens_at: w.opens_at, ratings: [] }))
                : activeTile === "answered"
                ? eiWindows
                : eiWindows.filter((w) => flaggedWindowIds.has(w.window_id));
            return (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
                <div className="px-5 py-3 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {activeTile === "pending" ? "Pending Surveys" : activeTile === "answered" ? "Answered Surveys" : "Flagged Surveys"}
                </div>
                {listWindows.length === 0 ? (
                  <div className="px-5 py-6 text-center text-sm text-gray-400">None found.</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {listWindows.map((w) => {
                      const pts = w.ratings.map((r) => ({ challenge: r.challenge, love: r.love }));
                      return (
                        <button
                          key={w.window_id}
                          onClick={() => activeTile !== "pending" ? setTileWindowId(w.window_id) : undefined}
                          disabled={activeTile === "pending"}
                          className={`w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors ${activeTile !== "pending" ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"}`}
                        >
                          {pts.length > 0 && <MiniScatterAdmin points={pts} size={56} />}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-gray-900">{w.window_name}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{new Date(w.opens_at).toLocaleDateString()}{pts.length > 0 ? ` · ${pts.length} rating${pts.length !== 1 ? "s" : ""}` : ""}</div>
                          </div>
                          {activeTile !== "pending" && (
                            <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Tile drilldown: scatter for a specific window */}
          {activeTile && tileWindowId && (() => {
            const w = eiWindows.find((w) => w.window_id === tileWindowId);
            if (!w) return null;
            const pts = w.ratings.map((r) => ({ challenge: r.challenge, love: r.love }));
            return (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
                  <button onClick={() => setTileWindowId(null)} className="text-xs text-crimson hover:underline flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    Back
                  </button>
                  <span className="text-xs text-gray-500">{w.window_name} · {new Date(w.opens_at).toLocaleDateString()}</span>
                </div>
                <div className="p-5">
                  <QuadrantScatter responses={pts} />
                  <div className="mt-4 border-t border-gray-100 -mx-5 -mb-5">
                    {w.ratings.map((r) => (
                      <button
                        key={`${w.window_id}-${r.class_id}`}
                        onClick={() => setDrillClassId(r.class_id)}
                        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                      >
                        <MiniScatterAdmin points={[{ challenge: r.challenge, love: r.love }]} size={56} single />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-900 truncate">{r.class_name}</div>
                          {r.teacher_name && <div className="text-xs text-gray-400">{r.teacher_name}</div>}
                          <div className="text-xs text-gray-500 mt-0.5">Challenge: {r.challenge} · Love: {r.love}</div>
                        </div>
                        <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Tab nav — only shown when no tile is active */}
          {!activeTile && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex border-b border-gray-100">
                {(["recent", "ytd", "lifetime"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setActiveTab(t); setShowBreakdown(false); }}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === t
                        ? "text-crimson border-b-2 border-crimson -mb-px"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    {t === "recent" ? "Most Recent" : t === "ytd" ? "Year to Date" : "Lifetime"}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {tabPoints.length === 0 ? (
                  <div className="text-center text-gray-400 py-8 text-sm">
                    No engagement responses {activeTab === "recent" ? "yet" : activeTab === "ytd" ? "this school year" : ""}.
                  </div>
                ) : (
                  <>
                    {activeTab === "recent" && recentWindow && (
                      <p className="text-xs text-gray-500 mb-3">
                        {recentWindow.window_name} · {new Date(recentWindow.opens_at).toLocaleDateString()}
                      </p>
                    )}
                    <QuadrantScatter responses={tabPoints} />
                    <button
                      onClick={() => setShowBreakdown((v) => !v)}
                      className="mt-4 w-full text-sm text-crimson hover:bg-crimson/5 transition-colors py-2 rounded-lg flex items-center justify-center gap-1.5"
                    >
                      {showBreakdown ? "Hide" : "View"} class breakdown ({tabPoints.length} rating{tabPoints.length !== 1 ? "s" : ""})
                      <svg className={`w-3.5 h-3.5 transition-transform ${showBreakdown ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {showBreakdown && (
                      <div className="mt-2 border-t border-gray-100 -mx-5 -mb-5">
                        {tabWindows.map((w) => (
                          <div key={w.window_id}>
                            <div className="px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-600">
                              {w.window_name} <span className="text-gray-400 font-normal">· {new Date(w.opens_at).toLocaleDateString()}</span>
                            </div>
                            <div className="divide-y divide-gray-50">
                              {w.ratings.map((r) => (
                                <button
                                  key={`${w.window_id}-${r.class_id}`}
                                  onClick={() => setDrillClassId(r.class_id)}
                                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                                >
                                  <MiniScatterAdmin points={[{ challenge: r.challenge, love: r.love }]} size={64} single />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm text-gray-900 truncate">{r.class_name}</div>
                                    {r.teacher_name && <div className="text-xs text-gray-400">{r.teacher_name}</div>}
                                    <div className="text-xs text-gray-500 mt-0.5">Challenge: {r.challenge} · Love: {r.love}</div>
                                  </div>
                                  <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  return <UserProfileContent userId={userId!} />;
}

// ─── Admin Classes ────────────────────────────────────────────────────────────

interface AdminClass {
  id: string;
  name: string;
  subject: string | null;
  grade_level: string | null;
  school_year: string | null;
  term: string | null;
  veracross_id: string | null;
  begin_date: string | null;
  end_date: string | null;
  student_count: number;
  teacher_count: number;
  primary_teacher_name: string | null;
  teacher_picture: string | null;
  sy_ei: { avg_c: number | null; avg_l: number | null; cnt: number } | null;
}

function AdminClassesPage() {
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/classes")
      .then((r) => r.json())
      .then((d) => { setClasses(d as AdminClass[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = classes.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.veracross_id ?? "").includes(search)
  );

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-4">Classes</h2>
      <div className="flex gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or Veracross ID…"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crimson/30"
        />
      </div>
      {loading && <div className="text-center text-gray-400 py-12">Loading…</div>}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {!loading && filtered.length === 0 && (
          <div className="p-8 text-center text-gray-400 text-sm">No classes found.</div>
        )}
        {filtered.map((cls, i) => (
          <div
            key={cls.id}
            className={`flex items-center gap-3 px-4 py-3 ${i < filtered.length - 1 ? "border-b border-gray-50" : ""}`}
          >
            {/* Teacher avatar */}
            {cls.teacher_picture ? (
              <img src={cls.teacher_picture} alt={cls.primary_teacher_name ?? ""} className="w-8 h-8 rounded-full object-cover object-top shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                {cls.primary_teacher_name?.[0] ?? "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <button
                onClick={() => setSelectedClassId(cls.id)}
                className="font-medium text-gray-900 text-sm truncate hover:text-crimson transition-colors cursor-pointer block text-left w-full"
              >
                {cls.name}
              </button>
              <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5 flex-wrap">
                {cls.veracross_id && <span>VC #{cls.veracross_id}</span>}
                {cls.grade_level && <span>· Grade {cls.grade_level}</span>}
                {cls.primary_teacher_name && <span>· {cls.primary_teacher_name}</span>}
                {cls.sy_ei?.cnt ? (
                  <span className="text-gray-400">
                    · {cls.sy_ei.cnt} response{cls.sy_ei.cnt !== 1 ? "s" : ""} this year
                    {cls.sy_ei.avg_c != null && ` · EI ${cls.sy_ei.avg_c.toFixed(1)} / ${cls.sy_ei.avg_l?.toFixed(1)}`}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="text-xs text-gray-500 shrink-0 flex items-center gap-3">
              <span>{cls.student_count} students</span>
            </div>
          </div>
        ))}
      </div>

      <SlideOver open={selectedClassId != null} onClose={() => setSelectedClassId(null)}>
        {selectedClassId && (
          <AdminClassDetailContent classId={selectedClassId} onClose={() => setSelectedClassId(null)} />
        )}
      </SlideOver>
    </div>
  );
}

interface AggregateData {
  cls: {
    id: string; name: string; veracross_id: string | null; grade_level: string | null;
    primary_teacher_name: string | null; begin_date: string | null; end_date: string | null;
    studentCount: number;
  };
  latest_window: {
    window: { id: string; name: string; opens_at: string };
    ei: { avg_c: number | null; avg_l: number | null; cnt: number } | null;
    mi: { avg_c: number | null; avg_l: number | null; cnt: number } | null;
    ei_points: { challenge: number; love: number }[];
  } | null;
  school_year: {
    ei: { avg_c: number | null; avg_l: number | null; cnt: number } | null;
    mi: { avg_c: number | null; avg_l: number | null; cnt: number } | null;
    window_count: number;
    ei_points: { challenge: number; love: number }[];
  };
  lifetime_course: {
    ei: { avg_c: number | null; avg_l: number | null; ei_cnt: number; win_cnt: number } | null;
    mi: { avg_c: number | null; avg_l: number | null; ei_cnt: number; win_cnt: number } | null;
    class_count: number;
    total_student_count?: number;
    ei_points: { challenge: number; love: number }[];
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
  eiPoints,
  windowCount,
  responseCount,
  windowLinks,
}: {
  title: string;
  subtitle?: string;
  ei: { avg_c: number | null; avg_l: number | null } | null | undefined;
  mi: { avg_c: number | null; avg_l: number | null } | null | undefined;
  eiPoints?: { challenge: number; love: number }[];
  windowCount?: number;
  responseCount?: number;
  windowLinks?: React.ReactNode;
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
        {windowCount != null && windowCount > 0 && (
          <span className="text-xs text-gray-400">{windowCount} window{windowCount !== 1 ? "s" : ""}</span>
        )}
        {responseCount != null && (
          <span className="text-xs text-gray-400">{responseCount} response{responseCount !== 1 ? "s" : ""}</span>
        )}
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
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5"><span>Challenge</span><span>/ 10</span></div>
                  <MetricBar value={ei!.avg_c} max={10} color="bg-green-400" />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5"><span>Love</span><span>/ 10</span></div>
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
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5"><span>Connection</span><span>/ 5</span></div>
                  <MetricBar value={mi!.avg_c} max={5} color="bg-blue-400" />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5"><span>Contribution</span><span>/ 5</span></div>
                  <MetricBar value={mi!.avg_l} max={5} color="bg-blue-400" />
                </div>
              </div>
            </div>
          )}
          {eiPoints && eiPoints.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Engagement Scatter</p>
              <QuadrantScatter responses={eiPoints} />
            </div>
          )}
        </div>
      )}
      {windowLinks && <div className="mt-4 pt-4 border-t border-gray-50">{windowLinks}</div>}
    </div>
  );
}

function AdminClassDetailContent({ classId, onClose }: { classId: string; onClose?: () => void }) {
  const navigate = useNavigate();
  const [data, setData] = useState<AggregateData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/classes/${classId}/aggregates`)
      .then((r) => r.json())
      .then((d) => { setData(d as AggregateData); setLoading(false); })
      .catch(() => setLoading(false));
  }, [classId]);

  if (loading) return <div className="text-center text-gray-400 py-12">Loading…</div>;
  if (!data) return <div className="text-center text-gray-400 py-12">Class not found.</div>;

  const { cls, latest_window, school_year, lifetime_course } = data;

  return (
    <div>
      {!onClose && (
        <button
          onClick={() => navigate("/admin/classes")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Classes
        </button>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 mb-6">
        <h2 className="text-xl font-bold text-gray-900">{cls.name}</h2>
        <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
          {cls.veracross_id && <span>VC #{cls.veracross_id}</span>}
          {cls.grade_level && <span>· Grade {cls.grade_level}</span>}
          <span>· {cls.studentCount} students enrolled</span>
          {cls.primary_teacher_name && <span>· {cls.primary_teacher_name}</span>}
          {cls.begin_date && cls.end_date && (
            <span>· {new Date(cls.begin_date).toLocaleDateString()} – {new Date(cls.end_date).toLocaleDateString()}</span>
          )}
        </div>
        {lifetime_course.total_student_count != null && (
          <p className="text-xs text-gray-400 mt-1">{lifetime_course.total_student_count} total students across all sections of this course</p>
        )}
      </div>

      <div className="space-y-4">
        <AggSection
          title="Latest Survey"
          subtitle={latest_window ? `${latest_window.window.name} · ${new Date(latest_window.window.opens_at).toLocaleDateString()}` : undefined}
          ei={latest_window?.ei}
          mi={latest_window?.mi}
          eiPoints={latest_window?.ei_points}
          responseCount={latest_window ? ((latest_window.ei?.cnt ?? 0) + (latest_window.mi?.cnt ?? 0)) : undefined}
        />
        <AggSection
          title="This School Year"
          subtitle={cls.begin_date ? `Since ${new Date(cls.begin_date).toLocaleDateString()}` : "Last 12 months"}
          ei={school_year.ei}
          mi={school_year.mi}
          eiPoints={school_year.ei_points}
          windowCount={school_year.window_count}
        />
        <AggSection
          title={`Lifetime — ${cls.name}`}
          subtitle={`Across all ${lifetime_course.class_count} section${lifetime_course.class_count !== 1 ? "s" : ""} (all teachers)`}
          ei={lifetime_course.ei}
          mi={lifetime_course.mi}
          eiPoints={lifetime_course.ei_points}
        />
      </div>
    </div>
  );
}

function AdminClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  return <AdminClassDetailContent classId={classId!} />;
}

// ─── Flagged ─────────────────────────────────────────────────────────────────

interface FlaggedResponse {
  id: string;
  student_id: string;
  student_name: string | null;
  student_picture: string | null;
  class_id: string;
  class_name: string | null;
  teacher_name: string | null;
  challenge: number;
  love: number;
  submitted_at: string;
  survey_window_id: string;
  window_name: string;
  zone: "anxiety" | "boredom";
}

function MiniDot({ challenge, love }: { challenge: number; love: number }) {
  const SIZE = 80;
  const PAD = 8;
  const PLOT = SIZE - PAD * 2;
  const x = PAD + ((challenge - 1) / 9) * PLOT;
  const y = PAD + ((10 - love) / 9) * PLOT;
  const zone = challenge > 5 && love <= 5 ? "anxiety" : challenge <= 5 && love <= 5 ? "boredom" : challenge > 5 ? "flow" : "comfort";
  const quadColors: Record<string, string> = {
    flow: "rgba(34,197,94,0.15)", comfort: "rgba(234,179,8,0.15)",
    anxiety: "rgba(239,68,68,0.15)", boredom: "rgba(156,163,175,0.15)",
  };
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="shrink-0">
      <rect x={PAD} y={PAD} width={PLOT / 2} height={PLOT / 2} fill={quadColors.comfort} />
      <rect x={PAD + PLOT / 2} y={PAD} width={PLOT / 2} height={PLOT / 2} fill={quadColors.flow} />
      <rect x={PAD} y={PAD + PLOT / 2} width={PLOT / 2} height={PLOT / 2} fill={quadColors.boredom} />
      <rect x={PAD + PLOT / 2} y={PAD + PLOT / 2} width={PLOT / 2} height={PLOT / 2} fill={quadColors.anxiety} />
      <rect x={PAD} y={PAD} width={PLOT} height={PLOT} fill="none" stroke="#e5e7eb" strokeWidth="1" />
      <line x1={PAD + PLOT / 2} y1={PAD} x2={PAD + PLOT / 2} y2={PAD + PLOT} stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="2,2" />
      <line x1={PAD} y1={PAD + PLOT / 2} x2={PAD + PLOT} y2={PAD + PLOT / 2} stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="2,2" />
      <circle cx={x} cy={y} r="5" fill="#8B0000" stroke="white" strokeWidth="1.5" />
    </svg>
  );
}

function FlaggedPage() {
  const [windows, setWindows] = useState<Array<{ id: string; name: string; opens_at: string }>>([]);
  const [windowId, setWindowId] = useState<string>("all");
  const [rows, setRows] = useState<FlaggedResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/surveys")
      .then((r) => r.json())
      .then((d: Array<{ id: string; name: string; opens_at: string; type: string }>) => {
        const ei = d.filter((w) => w.type === "engagement_index");
        setWindows(ei);
        if (ei.length > 0) setWindowId(ei[0].id);
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    const url = windowId === "all" ? "/api/admin/flagged" : `/api/admin/flagged?windowId=${windowId}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => { setRows(d as FlaggedResponse[]); setLoading(false); });
  }, [windowId]);

  // Group by student
  const byStudent = useMemo(() => {
    const map = new Map<string, { name: string | null; picture: string | null; responses: FlaggedResponse[] }>();
    for (const r of rows) {
      if (!map.has(r.student_id)) map.set(r.student_id, { name: r.student_name, picture: r.student_picture, responses: [] });
      map.get(r.student_id)!.responses.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => (a[1].name ?? "").localeCompare(b[1].name ?? ""));
  }, [rows]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Flagged Responses</h1>
          <p className="text-sm text-gray-500 mt-0.5">Students with very low love-of-learning (≤3) in 4+ classes</p>
        </div>
        <select
          value={windowId}
          onChange={(e) => setWindowId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white shadow-sm"
        >
          <option value="all">All windows</option>
          {windows.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading…</div>
      ) : byStudent.length === 0 ? (
        <div className="text-center text-gray-400 py-12">No flagged responses found.</div>
      ) : (
        <div className="space-y-4">
          {byStudent.map(([studentId, { name, picture, responses }]) => {
            const anxietyCount = responses.filter((r) => r.zone === "anxiety").length;
            const boredomCount = responses.filter((r) => r.zone === "boredom").length;
            const dominant = anxietyCount >= boredomCount ? "anxiety" : "boredom";
            return (
              <div key={studentId} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Student header */}
                <div className={`flex items-center gap-3 px-4 py-3 border-b ${dominant === "anxiety" ? "border-red-100 bg-red-50" : "border-gray-100 bg-gray-50"}`}>
                  {picture ? (
                    <img src={picture} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-crimson text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {name?.charAt(0) ?? "?"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-gray-900 text-sm">{name ?? "Unknown"}</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    {anxietyCount > 0 && (
                      <span className="bg-red-100 text-red-700 font-medium px-2 py-0.5 rounded-full">
                        {anxietyCount} anxiety
                      </span>
                    )}
                    {boredomCount > 0 && (
                      <span className="bg-gray-200 text-gray-600 font-medium px-2 py-0.5 rounded-full">
                        {boredomCount} boredom
                      </span>
                    )}
                  </div>
                </div>
                {/* Response rows */}
                <div className="divide-y divide-gray-50">
                  {responses.map((r) => (
                    <div key={r.id} className="flex items-center gap-4 px-4 py-3">
                      <MiniDot challenge={r.challenge} love={r.love} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">{r.class_name ?? "Unknown class"}</div>
                        {r.teacher_name && <div className="text-xs text-gray-500">{r.teacher_name}</div>}
                        <div className="text-xs text-gray-400 mt-0.5">{r.window_name}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-xs font-semibold px-2 py-1 rounded-full ${r.zone === "anxiety" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                          {r.zone}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">C:{r.challenge} L:{r.love}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const loc = useLocation();

  const tabs = [
    { to: "/admin", label: "Overview", exact: true },
    { to: "/admin/surveys", label: "Surveys" },
    { to: "/admin/flagged", label: "Flagged" },
    { to: "/admin/users", label: "Users" },
    { to: "/admin/classes", label: "Classes" },
    { to: "/admin/data", label: "Import Data" },
    { to: "/admin/sync", label: "Veracross Sync" },
  ];

  return (
    <div className="min-h-screen bg-warm">
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Tab bar */}
        <div className="flex gap-1 mb-8 bg-white rounded-xl border border-gray-100 p-1 shadow-sm w-fit">
          {tabs.map((t) => {
            const active = t.exact
              ? loc.pathname === t.to
              : loc.pathname.startsWith(t.to) && t.to !== "/admin";
            const isAdmin = loc.pathname === "/admin" && t.exact;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active || isAdmin
                    ? "bg-crimson text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        {/* Sub-routes */}
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/surveys" element={<SurveysPage />} />
          <Route path="/flagged" element={<FlaggedPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/users/:userId" element={<UserProfilePage />} />
          <Route path="/classes" element={<AdminClassesPage />} />
          <Route path="/classes/:classId" element={<AdminClassDetailPage />} />
          <Route path="/data" element={<AdminDataGrid />} />
          <Route path="/sync" element={<SyncPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </div>
    </div>
  );
}
