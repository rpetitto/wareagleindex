interface Response { challenge: number; love: number }

const PAD_L = 48;
const PAD_B = 48;
const PAD_T = 16;
const PAD_R = 16;
const SIZE = 360;
const PLOT_W = SIZE - PAD_L - PAD_R;
const PLOT_H = SIZE - PAD_T - PAD_B;

function toSvg(challenge: number, love: number) {
  return {
    x: PAD_L + ((challenge - 1) / 9) * PLOT_W,
    y: PAD_T + ((10 - love) / 9) * PLOT_H,
  };
}

const QUADRANT_FILLS = [
  { x: PAD_L + PLOT_W / 2, y: PAD_T, w: PLOT_W / 2, h: PLOT_H / 2, fill: "rgba(34,197,94,0.12)" },
  { x: PAD_L, y: PAD_T, w: PLOT_W / 2, h: PLOT_H / 2, fill: "rgba(234,179,8,0.12)" },
  { x: PAD_L + PLOT_W / 2, y: PAD_T + PLOT_H / 2, w: PLOT_W / 2, h: PLOT_H / 2, fill: "rgba(239,68,68,0.12)" },
  { x: PAD_L, y: PAD_T + PLOT_H / 2, w: PLOT_W / 2, h: PLOT_H / 2, fill: "rgba(156,163,175,0.12)" },
];

export default function QuadrantScatter({ responses }: { responses: Response[] }) {
  if (responses.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8 text-sm">No responses yet.</div>
    );
  }

  const avgChallenge = responses.reduce((s, r) => s + r.challenge, 0) / responses.length;
  const avgLove = responses.reduce((s, r) => s + r.love, 0) / responses.length;
  const avgDot = toSvg(avgChallenge, avgLove);

  // Count quadrants
  const quadCounts = { flow: 0, comfort: 0, anxiety: 0, boredom: 0 };
  for (const r of responses) {
    if (r.challenge >= 5.5 && r.love >= 5.5) quadCounts.flow++;
    else if (r.challenge < 5.5 && r.love >= 5.5) quadCounts.comfort++;
    else if (r.challenge >= 5.5 && r.love < 5.5) quadCounts.anxiety++;
    else quadCounts.boredom++;
  }

  // Group overlapping dots
  const dotMap = new Map<string, { challenge: number; love: number; count: number }>();
  for (const r of responses) {
    const key = `${r.challenge},${r.love}`;
    const existing = dotMap.get(key);
    if (existing) existing.count++;
    else dotMap.set(key, { challenge: r.challenge, love: r.love, count: 1 });
  }
  const dots = Array.from(dotMap.values());

  return (
    <div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-md mx-auto">
        {QUADRANT_FILLS.map((q, i) => (
          <rect key={i} x={q.x} y={q.y} width={q.w} height={q.h} fill={q.fill} />
        ))}
        <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="none" stroke="#d1d5db" strokeWidth="1.5" />
        <line x1={PAD_L + PLOT_W / 2} y1={PAD_T} x2={PAD_L + PLOT_W / 2} y2={PAD_T + PLOT_H} stroke="#d1d5db" strokeWidth="1" strokeDasharray="4,3" />
        <line x1={PAD_L} y1={PAD_T + PLOT_H / 2} x2={PAD_L + PLOT_W} y2={PAD_T + PLOT_H / 2} stroke="#d1d5db" strokeWidth="1" strokeDasharray="4,3" />

        {/* Student dots — grouped by position, radius grows with count */}
        {dots.map((dot, i) => {
          const d = toSvg(dot.challenge, dot.love);
          const r = dot.count === 1 ? 5 : dot.count <= 3 ? 7 : 9;
          return (
            <g key={i}>
              <circle cx={d.x} cy={d.y} r={r} fill="rgba(139,0,0,0.55)" stroke="white" strokeWidth="1" />
              {dot.count > 1 && (
                <text x={d.x} y={d.y + 4} textAnchor="middle" fontSize="8" fontWeight="bold" fill="white">
                  {dot.count}
                </text>
              )}
            </g>
          );
        })}

        {/* Average marker */}
        <circle cx={avgDot.x} cy={avgDot.y} r="10" fill="none" stroke="#8B0000" strokeWidth="2.5" />
        <circle cx={avgDot.x} cy={avgDot.y} r="4" fill="#8B0000" />

        {/* Axis ticks */}
        {[1, 3, 5, 7, 10].map((v) => {
          const { x } = toSvg(v, 1);
          return (
            <g key={`xt-${v}`}>
              <line x1={x} y1={PAD_T + PLOT_H} x2={x} y2={PAD_T + PLOT_H + 4} stroke="#9ca3af" strokeWidth="1" />
              <text x={x} y={PAD_T + PLOT_H + 15} textAnchor="middle" fontSize="10" fill="#9ca3af">{v}</text>
            </g>
          );
        })}
        <text x={PAD_L + PLOT_W / 2} y={SIZE - 2} textAnchor="middle" fontSize="11" fontWeight="600" fill="#374151">Challenge →</text>

        {[1, 3, 5, 7, 10].map((v) => {
          const { y } = toSvg(1, v);
          return (
            <g key={`yt-${v}`}>
              <line x1={PAD_L - 4} y1={y} x2={PAD_L} y2={y} stroke="#9ca3af" strokeWidth="1" />
              <text x={PAD_L - 7} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{v}</text>
            </g>
          );
        })}
        <text transform={`translate(12, ${PAD_T + PLOT_H / 2}) rotate(-90)`} textAnchor="middle" fontSize="11" fontWeight="600" fill="#374151">Love →</text>
      </svg>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
        <div className="bg-green-50 rounded-lg p-2">
          <div className="font-bold text-green-700 text-lg">{quadCounts.flow}</div>
          <div className="text-green-600">Flow Zone</div>
        </div>
        <div className="bg-yellow-50 rounded-lg p-2">
          <div className="font-bold text-yellow-700 text-lg">{quadCounts.comfort}</div>
          <div className="text-yellow-600">Comfort Zone</div>
        </div>
        <div className="bg-red-50 rounded-lg p-2">
          <div className="font-bold text-red-700 text-lg">{quadCounts.anxiety}</div>
          <div className="text-red-600">Anxiety Zone</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-2">
          <div className="font-bold text-gray-700 text-lg">{quadCounts.boredom}</div>
          <div className="text-gray-500">Boredom Zone</div>
        </div>
      </div>

      <div className="mt-3 flex justify-center gap-6 text-sm text-gray-600">
        <span>Avg Challenge: <strong className="text-crimson">{avgChallenge.toFixed(1)}</strong></span>
        <span>Avg Love: <strong className="text-crimson">{avgLove.toFixed(1)}</strong></span>
      </div>
    </div>
  );
}
