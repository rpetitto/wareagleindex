import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../App";

export default function NavBar() {
  const { user, logout } = useAuth();
  const loc = useLocation();

  const links =
    user?.role === "admin"
      ? [{ to: "/teacher", label: "Teacher View" }]
      : user?.role === "teacher"
      ? [{ to: "/teacher", label: "My Classes" }]
      : [{ to: "/student", label: "My Surveys" }];

  return (
    <nav className="bg-navy text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-crimson font-bold text-lg tracking-tight bg-white/10 px-2 py-0.5 rounded">WAI</span>
              <span className="text-white/80 text-sm hidden sm:inline font-medium">War Eagle Index</span>
            </Link>
            <div className="flex items-center gap-1">
              {links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    loc.pathname === l.to || loc.pathname.startsWith(l.to + "/")
                      ? "bg-white/20 text-white"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user?.picture && (
              <img src={user.picture} alt={user.name} className="w-7 h-7 rounded-full" />
            )}
            <span className="text-sm text-white/80 hidden sm:inline">{user?.name}</span>
            <button
              onClick={logout}
              className="text-sm text-white/60 hover:text-white transition-colors px-2 py-1"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
