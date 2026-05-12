// Builds HTML for a student engagement summary PDF (rendered by ZipZign)

interface EIRating {
  class_id: string;
  class_name: string;
  teacher_name: string | null;
  challenge: number;
  love: number;
  window_id: string;
  window_name: string;
  opens_at: string;
}

interface ReportWindow {
  window_id: string;
  window_name: string;
  opens_at: string;
  ratings: EIRating[];
}

function quadrant(challenge: number, love: number): { label: string; color: string } {
  if (challenge >= 5.5 && love >= 5.5) return { label: "Flow Zone", color: "#16a34a" };
  if (challenge < 5.5 && love >= 5.5) return { label: "Comfort Zone", color: "#ca8a04" };
  if (challenge >= 5.5 && love < 5.5) return { label: "Anxiety Zone", color: "#dc2626" };
  return { label: "Boredom Zone", color: "#6b7280" };
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

function scatterSvg(ratings: EIRating[], size = 280): string {
  const PAD_L = 44, PAD_B = 44, PAD_T = 12, PAD_R = 12;
  const W = size - PAD_L - PAD_R;
  const H = size - PAD_T - PAD_B;
  const tx = (c: number) => PAD_L + ((c - 1) / 9) * W;
  const ty = (l: number) => PAD_T + ((10 - l) / 9) * H;

  // Group overlapping dots
  const dotMap = new Map<string, { c: number; l: number; count: number }>();
  for (const r of ratings) {
    const key = `${r.challenge},${r.love}`;
    const e = dotMap.get(key);
    if (e) e.count++;
    else dotMap.set(key, { c: r.challenge, l: r.love, count: 1 });
  }
  const dots = Array.from(dotMap.values());

  const avgC = avg(ratings.map(r => r.challenge));
  const avgL = avg(ratings.map(r => r.love));
  const ax = tx(avgC), ay = ty(avgL);

  const ticks = [1, 3, 5, 7, 10];

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto">
  <rect x="${PAD_L}" y="${PAD_T}" width="${W / 2}" height="${H / 2}" fill="rgba(234,179,8,0.12)"/>
  <rect x="${PAD_L + W / 2}" y="${PAD_T}" width="${W / 2}" height="${H / 2}" fill="rgba(34,197,94,0.12)"/>
  <rect x="${PAD_L}" y="${PAD_T + H / 2}" width="${W / 2}" height="${H / 2}" fill="rgba(156,163,175,0.12)"/>
  <rect x="${PAD_L + W / 2}" y="${PAD_T + H / 2}" width="${W / 2}" height="${H / 2}" fill="rgba(239,68,68,0.12)"/>
  <rect x="${PAD_L}" y="${PAD_T}" width="${W}" height="${H}" fill="none" stroke="#d1d5db" stroke-width="1.5"/>
  <line x1="${PAD_L + W / 2}" y1="${PAD_T}" x2="${PAD_L + W / 2}" y2="${PAD_T + H}" stroke="#d1d5db" stroke-width="1" stroke-dasharray="4,3"/>
  <line x1="${PAD_L}" y1="${PAD_T + H / 2}" x2="${PAD_L + W}" y2="${PAD_T + H / 2}" stroke="#d1d5db" stroke-width="1" stroke-dasharray="4,3"/>
  ${dots.map(d => {
    const r = d.count === 1 ? 5 : d.count <= 3 ? 7 : 9;
    return `<circle cx="${tx(d.c)}" cy="${ty(d.l)}" r="${r}" fill="rgba(139,0,0,0.55)" stroke="white" stroke-width="1"/>
    ${d.count > 1 ? `<text x="${tx(d.c)}" y="${ty(d.l) + 4}" text-anchor="middle" font-size="8" font-weight="bold" fill="white">${d.count}</text>` : ""}`;
  }).join("")}
  <circle cx="${ax}" cy="${ay}" r="10" fill="none" stroke="#8B0000" stroke-width="2.5"/>
  <circle cx="${ax}" cy="${ay}" r="4" fill="#8B0000"/>
  ${ticks.map(v => `
    <line x1="${tx(v)}" y1="${PAD_T + H}" x2="${tx(v)}" y2="${PAD_T + H + 4}" stroke="#9ca3af" stroke-width="1"/>
    <text x="${tx(v)}" y="${PAD_T + H + 15}" text-anchor="middle" font-size="10" fill="#9ca3af">${v}</text>
    <line x1="${PAD_L - 4}" y1="${ty(v)}" x2="${PAD_L}" y2="${ty(v)}" stroke="#9ca3af" stroke-width="1"/>
    <text x="${PAD_L - 7}" y="${ty(v) + 4}" text-anchor="end" font-size="10" fill="#9ca3af">${v}</text>
  `).join("")}
  <text x="${PAD_L + W / 2}" y="${size - 2}" text-anchor="middle" font-size="11" font-weight="600" fill="#374151">Challenge →</text>
  <text transform="translate(12,${PAD_T + H / 2}) rotate(-90)" text-anchor="middle" font-size="11" font-weight="600" fill="#374151">Love →</text>
</svg>`;
}

export function buildEngagementReportHtml(opts: {
  studentName: string;
  studentEmail: string;
  generatedDate: string;
  schoolYear: string;
  eiWindows: ReportWindow[];
  totalAnswered: number;
}): string {
  const { studentName, studentEmail, generatedDate, schoolYear, eiWindows, totalAnswered } = opts;

  const allRatings: EIRating[] = eiWindows.flatMap(w => w.ratings);
  const avgChallenge = avg(allRatings.map(r => r.challenge));
  const avgLove = avg(allRatings.map(r => r.love));

  const qCounts = { flow: 0, comfort: 0, anxiety: 0, boredom: 0 };
  for (const r of allRatings) {
    if (r.challenge >= 5.5 && r.love >= 5.5) qCounts.flow++;
    else if (r.challenge < 5.5 && r.love >= 5.5) qCounts.comfort++;
    else if (r.challenge >= 5.5 && r.love < 5.5) qCounts.anxiety++;
    else qCounts.boredom++;
  }

  const windowRows = eiWindows.map(w => {
    const wAvgC = avg(w.ratings.map(r => r.challenge));
    const wAvgL = avg(w.ratings.map(r => r.love));
    const wQ = quadrant(wAvgC, wAvgL);
    return `
    <div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;page-break-inside:avoid">
      <div style="background:#f9fafb;padding:10px 14px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
        <div>
          <span style="font-weight:600;color:#111827;font-size:13px">${w.window_name}</span>
          <span style="color:#9ca3af;font-size:11px;margin-left:8px">${new Date(w.opens_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
        <span style="font-size:11px;font-weight:600;color:${wQ.color};background:${wQ.color}18;padding:2px 8px;border-radius:20px">${wQ.label}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:7px 14px;text-align:left;color:#6b7280;font-weight:600">Class</th>
            <th style="padding:7px 8px;text-align:center;color:#6b7280;font-weight:600">Challenge</th>
            <th style="padding:7px 8px;text-align:center;color:#6b7280;font-weight:600">Love</th>
            <th style="padding:7px 14px;text-align:right;color:#6b7280;font-weight:600">Zone</th>
          </tr>
        </thead>
        <tbody>
          ${w.ratings.map((r, i) => {
            const q = quadrant(r.challenge, r.love);
            return `<tr style="border-top:1px solid #f3f4f6;background:${i % 2 === 1 ? "#fafafa" : "white"}">
              <td style="padding:8px 14px">
                <div style="font-weight:500;color:#111827">${r.class_name}</div>
                ${r.teacher_name ? `<div style="color:#9ca3af;font-size:11px">${r.teacher_name}</div>` : ""}
              </td>
              <td style="padding:8px;text-align:center;color:#374151;font-weight:600">${r.challenge}</td>
              <td style="padding:8px;text-align:center;color:#374151;font-weight:600">${r.love}</td>
              <td style="padding:8px 14px;text-align:right;font-size:11px;font-weight:600;color:${q.color}">${q.label}</td>
            </tr>`;
          }).join("")}
          <tr style="background:#f9fafb;border-top:2px solid #e5e7eb">
            <td style="padding:8px 14px;font-weight:600;color:#374151;font-size:11px">Average</td>
            <td style="padding:8px;text-align:center;font-weight:700;color:#8B0000">${wAvgC.toFixed(1)}</td>
            <td style="padding:8px;text-align:center;font-weight:700;color:#8B0000">${wAvgL.toFixed(1)}</td>
            <td style="padding:8px 14px;text-align:right;font-size:11px;font-weight:600;color:${wQ.color}">${wQ.label}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; background: white; padding: 32px; }
  .crimson { color: #8B0000; }
</style>
</head>
<body>

<!-- Header -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #8B0000">
  <div>
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:4px">War Eagle Index · Engagement Summary</div>
    <h1 style="font-size:26px;font-weight:700;color:#111827">${studentName}</h1>
    <div style="color:#6b7280;font-size:13px;margin-top:3px">${studentEmail}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;color:#9ca3af">School Year ${schoolYear}</div>
    <div style="font-size:11px;color:#9ca3af;margin-top:2px">Generated ${generatedDate}</div>
  </div>
</div>

<!-- Stats row -->
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px">
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;text-align:center">
    <div style="font-size:28px;font-weight:700;color:#8B0000">${totalAnswered}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px">Surveys completed</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;text-align:center">
    <div style="font-size:28px;font-weight:700;color:#374151">${allRatings.length}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px">Total ratings</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;text-align:center">
    <div style="font-size:28px;font-weight:700;color:#8B0000">${allRatings.length ? avgChallenge.toFixed(1) : "—"}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px">Avg challenge</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;text-align:center">
    <div style="font-size:28px;font-weight:700;color:#8B0000">${allRatings.length ? avgLove.toFixed(1) : "—"}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px">Avg love</div>
  </div>
</div>

${allRatings.length > 0 ? `
<!-- Scatter plot + quadrant counts -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px;align-items:center">
  <div>
    ${scatterSvg(allRatings, 260)}
  </div>
  <div>
    <h3 style="font-size:13px;font-weight:600;color:#374151;margin-bottom:12px">Lifetime Distribution</h3>
    <div style="space-y:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#dcfce7;border-radius:6px;margin-bottom:8px">
        <span style="font-size:12px;font-weight:600;color:#15803d">Flow Zone</span>
        <span style="font-size:18px;font-weight:700;color:#15803d">${qCounts.flow}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#fef9c3;border-radius:6px;margin-bottom:8px">
        <span style="font-size:12px;font-weight:600;color:#854d0e">Comfort Zone</span>
        <span style="font-size:18px;font-weight:700;color:#854d0e">${qCounts.comfort}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#fee2e2;border-radius:6px;margin-bottom:8px">
        <span style="font-size:12px;font-weight:600;color:#991b1b">Anxiety Zone</span>
        <span style="font-size:18px;font-weight:700;color:#991b1b">${qCounts.anxiety}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#f3f4f6;border-radius:6px">
        <span style="font-size:12px;font-weight:600;color:#4b5563">Boredom Zone</span>
        <span style="font-size:18px;font-weight:700;color:#4b5563">${qCounts.boredom}</span>
      </div>
    </div>
  </div>
</div>
` : ""}

<!-- Survey history -->
${eiWindows.length > 0 ? `
<h2 style="font-size:15px;font-weight:700;color:#111827;margin-bottom:14px">Survey History (Engagement Index)</h2>
${windowRows}
` : `<div style="text-align:center;color:#9ca3af;padding:40px 0;font-size:14px">No engagement survey responses on record.</div>`}

<!-- Footer -->
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
  <span style="font-size:10px;color:#9ca3af">War Eagle Index · Woodward Academy</span>
  <span style="font-size:10px;color:#9ca3af">Confidential — For educator use only</span>
</div>

</body>
</html>`;
}
