import { useEffect, useState } from "react";
import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import NavBar from "../components/NavBar";

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

function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    fetch("/api/admin/overview").then((r) => r.json()).then((d) => setData(d as Overview));
  }, []);

  if (!data) return <div className="text-center text-gray-400 py-12">Loading…</div>;

  const stats = [
    { label: "Students", value: data.students, color: "text-crimson" },
    { label: "Teachers", value: data.teachers, color: "text-blue-600" },
    { label: "Classes", value: data.classes, color: "text-purple-600" },
    { label: "Total Responses", value: data.totalResponses, color: "text-green-600" },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">School Overview</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
            <div className={`text-3xl font-bold ${s.color}`}>{s.value.toLocaleString()}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

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
              <div key={w.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_BADGE[w.type] ?? "bg-gray-100 text-gray-600"}`}>
                    {TYPE_LABEL[w.type] ?? w.type}
                  </span>
                  <span className="font-medium text-gray-800 text-sm">{w.name}</span>
                </div>
                <span className="text-xs text-gray-400">
                  Closes {new Date(w.closes_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
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
            <div key={w.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
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
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{w.name}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(w.opens_at).toLocaleString()} → {new Date(w.closes_at).toLocaleString()}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.color}`}>
                    {status.label}
                  </span>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => setEditingId(w.id)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(w.id)}
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
              <img src={u.picture} alt={u.name} className="w-8 h-8 rounded-full shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                {u.name[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 text-sm truncate">{u.name}</p>
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
    </div>
  );
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

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
}

function SyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  function loadLogs() {
    setLogsLoading(true);
    fetch("/api/admin/sync/logs")
      .then((r) => r.json())
      .then((d) => { setLogs(d as SyncLog[]); setLogsLoading(false); })
      .catch(() => setLogsLoading(false));
  }

  useEffect(loadLogs, []);

  async function runSync() {
    setSyncing(true);
    try {
      await fetch("/api/admin/sync", { method: "POST" });
    } catch { /* error is recorded server-side */ }
    setSyncing(false);
    loadLogs();
  }

  function fmt(ms: number | null) {
    if (ms == null) return "";
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Veracross Sync</h2>
          <p className="text-gray-500 text-sm mt-1">
            Syncs students, teachers, classes, and enrollments. Runs are logged below.
          </p>
        </div>
        <button
          onClick={runSync}
          disabled={syncing}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white text-sm transition-all ${
            syncing ? "bg-gray-300 cursor-not-allowed" : "bg-crimson hover:bg-crimson-dark shadow-sm"
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
              Run Veracross Sync
            </>
          )}
        </button>
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
                <div className="flex items-center gap-3 mb-2">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    log.status === "ok" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {log.status === "ok" ? (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    {log.status === "ok" ? "Success" : "Failed"}
                  </span>
                  <span className="text-sm text-gray-700">
                    {new Date(log.ran_at + "Z").toLocaleString()}
                  </span>
                  {log.duration_ms != null && (
                    <span className="text-xs text-gray-400 ml-auto">{fmt(log.duration_ms)}</span>
                  )}
                </div>

                {log.status === "ok" ? (
                  <div className="flex flex-wrap gap-4">
                    {([
                      ["Students", log.students],
                      ["Teachers", log.teachers],
                      ["Classes", log.classes],
                      ["Enrollments", log.enrollments],
                      ["Teacher links", log.teacher_assignments],
                    ] as [string, number | null][]).map(([label, val]) => (
                      <div key={label} className="text-center">
                        <div className="text-lg font-bold text-gray-900">{val ?? "—"}</div>
                        <div className="text-xs text-gray-400">{label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-red-600 font-mono bg-red-50 rounded-lg px-3 py-2 mt-1">
                    {log.error_message}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const loc = useLocation();

  const tabs = [
    { to: "/admin", label: "Overview", exact: true },
    { to: "/admin/surveys", label: "Surveys" },
    { to: "/admin/users", label: "Users" },
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
          <Route path="/users" element={<UsersPage />} />
          <Route path="/sync" element={<SyncPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </div>
    </div>
  );
}
