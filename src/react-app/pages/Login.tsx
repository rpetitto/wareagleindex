export default function Login() {
  const error = new URLSearchParams(window.location.search).get("error");

  return (
    <div className="min-h-screen bg-warm flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo / header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-crimson mb-4 shadow-lg">
            <span className="text-white font-black text-2xl tracking-tight">WA</span>
          </div>
          <h1 className="text-3xl font-bold text-navy">War Eagle Index</h1>
          <p className="text-gray-500 mt-1 text-sm tracking-wide uppercase font-medium">
            Woodward Academy · Student Engagement
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <p className="text-gray-600 text-center mb-6 text-sm leading-relaxed">
            Sign in with your Woodward Academy Google account to access surveys and dashboards.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm text-center">
              {error === "auth_failed"
                ? "Sign-in failed. Please try again."
                : "Authentication error. Please try again."}
            </div>
          )}

          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-3 w-full py-3 px-4 rounded-xl border-2 border-crimson bg-crimson text-white font-semibold text-sm hover:bg-crimson-dark transition-colors shadow-sm"
          >
            <GoogleIcon />
            Sign in with Google
          </a>

          <p className="text-gray-400 text-xs text-center mt-6">
            Use your @woodward.edu Google account
          </p>
        </div>

        {/* Mission / motto */}
        <div className="mt-8 text-center space-y-3">
          <p className="text-xs font-semibold tracking-widest text-crimson uppercase">
            Excellence · Character · Opportunity
          </p>
          <p className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">
            Woodward Academy will be the national model in college-preparatory education.
          </p>
          <p className="text-gray-400 text-xs mt-4">College Park, GA</p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
