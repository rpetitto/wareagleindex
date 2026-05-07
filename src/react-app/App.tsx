import { createContext, useContext, useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Login from "./pages/Login";
import StudentDashboard from "./pages/StudentDashboard";
import SurveyTaker from "./pages/SurveyTaker";
import EngagementSurvey from "./pages/EngagementSurvey";
import TeacherDashboard from "./pages/TeacherDashboard";
import TeacherClassDetail from "./pages/TeacherClassDetail";
import ClassResults from "./pages/ClassResults";
import AdminDashboard from "./pages/AdminDashboard";
import StudentHistory from "./pages/StudentHistory";
import StudentResponseView from "./pages/StudentResponseView";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "student" | "teacher" | "admin";
  picture: string | null;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({ user: null, loading: true, logout: async () => {} });
export const useAuth = () => useContext(AuthContext);

function RoleHome({ role }: { role: string }) {
  if (role === "admin") return <Navigate to="/admin" replace />;
  if (role === "teacher") return <Navigate to="/teacher" replace />;
  return <Navigate to="/student" replace />;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setUser(data as User | null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    navigate("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm">
        <div className="text-crimson text-lg font-medium">Loading…</div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      <Routes>
        <Route path="/login" element={user ? <RoleHome role={user.role} /> : <Login />} />
        <Route
          path="/"
          element={user ? <RoleHome role={user.role} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/student"
          element={user ? <StudentDashboard /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/student/survey/:windowId"
          element={user ? <EngagementSurvey /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/student/survey/:windowId/:classId"
          element={user ? <SurveyTaker /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/teacher"
          element={
            user && (user.role === "teacher" || user.role === "admin") ? (
              <TeacherDashboard />
            ) : user ? (
              <Navigate to="/" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/teacher/class/:classId"
          element={
            user && (user.role === "teacher" || user.role === "admin") ? (
              <TeacherClassDetail />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/teacher/class/:classId/window/:windowId"
          element={
            user && (user.role === "teacher" || user.role === "admin") ? (
              <ClassResults />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/student/history"
          element={user ? <StudentHistory /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/student/survey/:windowId/:classId/view"
          element={user ? <StudentResponseView /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/admin/*"
          element={
            user?.role === "admin" ? (
              <AdminDashboard />
            ) : user ? (
              <Navigate to="/" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Made with Fling badge */}
      <a
        href="https://flingit.io"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 left-4 flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-full shadow-sm text-xs text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors z-50"
      >
        <img src="/fling.svg" alt="Fling" className="w-4 h-4" />
        Made with Fling
      </a>
    </AuthContext.Provider>
  );
}
