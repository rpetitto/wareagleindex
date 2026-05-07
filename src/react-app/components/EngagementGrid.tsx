import { useRef, useState } from "react";

interface Props {
  value: { challenge: number; love: number } | null;
  onChange: (v: { challenge: number; love: number }) => void;
  readonly?: boolean;
}

const PAD_L = 48; // left padding for Y label
const PAD_B = 48; // bottom padding for X label
const PAD_T = 16;
const PAD_R = 16;
const SIZE = 380;
const PLOT_W = SIZE - PAD_L - PAD_R;
const PLOT_H = SIZE - PAD_T - PAD_B;

function dataToSvg(challenge: number, love: number) {
  const x = PAD_L + ((challenge - 1) / 9) * PLOT_W;
  const y = PAD_T + ((10 - love) / 9) * PLOT_H;
  return { x, y };
}

function svgToData(svgX: number, svgY: number) {
  const challenge = Math.max(1, Math.min(10, Math.round(1 + ((svgX - PAD_L) / PLOT_W) * 9)));
  const love = Math.max(1, Math.min(10, Math.round(10 - ((svgY - PAD_T) / PLOT_H) * 9)));
  return { challenge, love };
}

const QUADRANTS = [
  {
    label: "Flow Zone",
    sublabel: "Challenged & loving it",
    color: "rgba(34,197,94,0.15)",
    textColor: "#15803d",
    x: PAD_L + PLOT_W / 2,
    y: PAD_T,
    w: PLOT_W / 2,
    h: PLOT_H / 2,
    anchor: "end" as const,
    dx: PLOT_W / 2 - 8,
    dy: 20,
  },
  {
    label: "Comfort Zone",
    sublabel: "Easy but enjoyable",
    color: "rgba(234,179,8,0.15)",
    textColor: "#92400e",
    x: PAD_L,
    y: PAD_T,
    w: PLOT_W / 2,
    h: PLOT_H / 2,
    anchor: "start" as const,
    dx: 8,
    dy: 20,
  },
  {
    label: "Anxiety Zone",
    sublabel: "Hard but not fun",
    color: "rgba(239,68,68,0.15)",
    textColor: "#b91c1c",
    x: PAD_L + PLOT_W / 2,
    y: PAD_T + PLOT_H / 2,
    w: PLOT_W / 2,
    h: PLOT_H / 2,
    anchor: "end" as const,
    dx: PLOT_W / 2 - 8,
    dy: 20,
  },
  {
    label: "Boredom Zone",
    sublabel: "Not challenged, not fun",
    color: "rgba(156,163,175,0.15)",
    textColor: "#6b7280",
    x: PAD_L,
    y: PAD_T + PLOT_H / 2,
    w: PLOT_W / 2,
    h: PLOT_H / 2,
    anchor: "start" as const,
    dx: 8,
    dy: 20,
  },
];

export default function EngagementGrid({ value, onChange, readonly = false }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);

  function getSvgCoords(e: React.MouseEvent | React.TouchEvent) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scaleX = SIZE / rect.width;
    const scaleY = SIZE / rect.height;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const svgX = (clientX - rect.left) * scaleX;
    const svgY = (clientY - rect.top) * scaleY;
    if (svgX < PAD_L || svgX > SIZE - PAD_R || svgY < PAD_T || svgY > SIZE - PAD_B) return null;
    return svgToData(svgX, svgY);
  }

  function handleInteract(e: React.MouseEvent | React.TouchEvent) {
    if (readonly) return;
    const coords = getSvgCoords(e);
    if (coords) onChange(coords);
  }

  const dot = value ? dataToSvg(value.challenge, value.love) : null;

  return (
    <div className="select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={`w-full max-w-md mx-auto ${!readonly ? "cursor-crosshair" : ""}`}
        style={{ touchAction: "none" }}
        onMouseDown={(e) => { setDragging(true); handleInteract(e); }}
        onMouseMove={(e) => { if (dragging) handleInteract(e); }}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
        onTouchStart={(e) => { e.preventDefault(); handleInteract(e); }}
        onTouchMove={(e) => { e.preventDefault(); handleInteract(e); }}
      >
        {/* Quadrant fills */}
        {QUADRANTS.map((q) => (
          <rect key={q.label} x={q.x} y={q.y} width={q.w} height={q.h} fill={q.color} />
        ))}

        {/* Plot border */}
        <rect
          x={PAD_L} y={PAD_T}
          width={PLOT_W} height={PLOT_H}
          fill="none" stroke="#d1d5db" strokeWidth="1.5"
        />

        {/* Center dividers */}
        <line
          x1={PAD_L + PLOT_W / 2} y1={PAD_T}
          x2={PAD_L + PLOT_W / 2} y2={PAD_T + PLOT_H}
          stroke="#d1d5db" strokeWidth="1" strokeDasharray="4,3"
        />
        <line
          x1={PAD_L} y1={PAD_T + PLOT_H / 2}
          x2={PAD_L + PLOT_W} y2={PAD_T + PLOT_H / 2}
          stroke="#d1d5db" strokeWidth="1" strokeDasharray="4,3"
        />

        {/* Quadrant labels */}
        {QUADRANTS.map((q) => (
          <g key={`lbl-${q.label}`}>
            <text
              x={q.x + q.dx} y={q.y + q.dy}
              textAnchor={q.anchor} fontSize="11" fontWeight="700"
              fill={q.textColor} opacity="0.8"
            >
              {q.label}
            </text>
            <text
              x={q.x + q.dx} y={q.y + q.dy + 14}
              textAnchor={q.anchor} fontSize="9"
              fill={q.textColor} opacity="0.6"
            >
              {q.sublabel}
            </text>
          </g>
        ))}

        {/* X axis ticks and label */}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => {
          const { x } = dataToSvg(v, 1);
          return (
            <g key={`xt-${v}`}>
              <line x1={x} y1={PAD_T + PLOT_H} x2={x} y2={PAD_T + PLOT_H + 4} stroke="#9ca3af" strokeWidth="1" />
              <text x={x} y={PAD_T + PLOT_H + 16} textAnchor="middle" fontSize="10" fill="#9ca3af">{v}</text>
            </g>
          );
        })}
        <text
          x={PAD_L + PLOT_W / 2} y={SIZE - 2}
          textAnchor="middle" fontSize="12" fontWeight="600" fill="#374151"
        >
          Academic Challenge →
        </text>

        {/* Y axis ticks and label */}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => {
          const { y } = dataToSvg(1, v);
          return (
            <g key={`yt-${v}`}>
              <line x1={PAD_L - 4} y1={y} x2={PAD_L} y2={y} stroke="#9ca3af" strokeWidth="1" />
              <text x={PAD_L - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{v}</text>
            </g>
          );
        })}
        <text
          transform={`translate(12, ${PAD_T + PLOT_H / 2}) rotate(-90)`}
          textAnchor="middle" fontSize="12" fontWeight="600" fill="#374151"
        >
          Love of Learning →
        </text>

        {/* Placed dot */}
        {dot && (
          <g>
            <circle cx={dot.x} cy={dot.y} r="14" fill="rgba(139,0,0,0.12)" />
            <circle cx={dot.x} cy={dot.y} r="8" fill="#8B0000" stroke="white" strokeWidth="2" />
          </g>
        )}

        {/* Placeholder hint */}
        {!dot && !readonly && (
          <text
            x={PAD_L + PLOT_W / 2} y={PAD_T + PLOT_H / 2 + 4}
            textAnchor="middle" fontSize="13" fill="#9ca3af"
          >
            Click to place your response
          </text>
        )}
      </svg>

      {/* Current value readout */}
      {value && (
        <div className="flex justify-center gap-6 mt-2 text-sm text-gray-600">
          <span>Challenge: <strong className="text-crimson">{value.challenge}</strong>/10</span>
          <span>Love: <strong className="text-crimson">{value.love}</strong>/10</span>
        </div>
      )}
    </div>
  );
}
