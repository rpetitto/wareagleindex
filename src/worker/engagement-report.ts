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

function quadrant(challenge: number, love: number): { label: string; color: string; bg: string } {
  if (challenge >= 5.5 && love >= 5.5) return { label: "Flow Zone",    color: "#15803d", bg: "#dcfce7" };
  if (challenge < 5.5  && love >= 5.5) return { label: "Comfort Zone", color: "#854d0e", bg: "#fef9c3" };
  if (challenge >= 5.5 && love < 5.5)  return { label: "Anxiety Zone", color: "#991b1b", bg: "#fee2e2" };
  return                                       { label: "Boredom Zone", color: "#4b5563", bg: "#f3f4f6" };
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

// Simple bar to visually represent a 1–10 value
function bar(value: number): string {
  const filled = Math.round(value);
  const empty  = 10 - filled;
  return `<span style="letter-spacing:1px;color:#8B0000">${"■".repeat(filled)}</span><span style="letter-spacing:1px;color:#e5e7eb">${"□".repeat(empty)}</span>`;
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
  const avgLove      = avg(allRatings.map(r => r.love));

  const qCounts = { flow: 0, comfort: 0, anxiety: 0, boredom: 0 };
  for (const r of allRatings) {
    if      (r.challenge >= 5.5 && r.love >= 5.5) qCounts.flow++;
    else if (r.challenge <  5.5 && r.love >= 5.5) qCounts.comfort++;
    else if (r.challenge >= 5.5 && r.love <  5.5) qCounts.anxiety++;
    else                                           qCounts.boredom++;
  }

  const windowRows = eiWindows.map(w => {
    const wAvgC = avg(w.ratings.map(r => r.challenge));
    const wAvgL = avg(w.ratings.map(r => r.love));
    const wQ    = quadrant(wAvgC, wAvgL);
    const dateStr = new Date(w.opens_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    const classRows = w.ratings.map((r, i) => {
      const q = quadrant(r.challenge, r.love);
      return `<tr style="background:${i % 2 === 1 ? "#fafafa" : "white"};border-top:1px solid #f3f4f6">
        <td style="padding:8px 14px">
          <div style="font-weight:500;color:#111827;font-size:12px">${r.class_name}</div>
          ${r.teacher_name ? `<div style="color:#9ca3af;font-size:10px">${r.teacher_name}</div>` : ""}
        </td>
        <td style="padding:8px;text-align:center;font-size:12px">${bar(r.challenge)} ${r.challenge}</td>
        <td style="padding:8px;text-align:center;font-size:12px">${bar(r.love)} ${r.love}</td>
        <td style="padding:8px 14px;text-align:right;font-size:11px;font-weight:600;color:${q.color};background:${q.bg}">${q.label}</td>
      </tr>`;
    }).join("");

    return `<div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;page-break-inside:avoid">
      <div style="background:#f9fafb;padding:10px 14px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
        <div>
          <span style="font-weight:600;color:#111827;font-size:13px">${w.window_name}</span>
          <span style="color:#9ca3af;font-size:11px;margin-left:8px">${dateStr}</span>
        </div>
        <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;color:${wQ.color};background:${wQ.bg}">${wQ.label} · C:${wAvgC.toFixed(1)} L:${wAvgL.toFixed(1)}</span>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:6px 14px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Class</th>
            <th style="padding:6px 8px;text-align:center;font-size:11px;color:#6b7280;font-weight:600">Challenge</th>
            <th style="padding:6px 8px;text-align:center;font-size:11px;color:#6b7280;font-weight:600">Love</th>
            <th style="padding:6px 14px;text-align:right;font-size:11px;color:#6b7280;font-weight:600">Zone</th>
          </tr>
        </thead>
        <tbody>${classRows}</tbody>
      </table>
    </div>`;
  }).join("");

  const quadrantTable = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
      <tr>
        <td style="width:50%;padding:10px 8px 10px 0">
          <div style="background:#dcfce7;border-radius:8px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:12px;font-weight:600;color:#15803d">Flow Zone <span style="font-weight:400;font-size:11px">(high challenge + high love)</span></span>
            <span style="font-size:22px;font-weight:700;color:#15803d">${qCounts.flow}</span>
          </div>
        </td>
        <td style="width:50%;padding:10px 0 10px 8px">
          <div style="background:#fef9c3;border-radius:8px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:12px;font-weight:600;color:#854d0e">Comfort Zone <span style="font-weight:400;font-size:11px">(low challenge + high love)</span></span>
            <span style="font-size:22px;font-weight:700;color:#854d0e">${qCounts.comfort}</span>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 8px 0 0">
          <div style="background:#fee2e2;border-radius:8px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:12px;font-weight:600;color:#991b1b">Anxiety Zone <span style="font-weight:400;font-size:11px">(high challenge + low love)</span></span>
            <span style="font-size:22px;font-weight:700;color:#991b1b">${qCounts.anxiety}</span>
          </div>
        </td>
        <td style="padding:10px 0 0 8px">
          <div style="background:#f3f4f6;border-radius:8px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:12px;font-weight:600;color:#4b5563">Boredom Zone <span style="font-weight:400;font-size:11px">(low challenge + low love)</span></span>
            <span style="font-size:22px;font-weight:700;color:#4b5563">${qCounts.boredom}</span>
          </div>
        </td>
      </tr>
    </table>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/>
<style>* { box-sizing:border-box; margin:0; padding:0; } body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#111827; background:white; padding:32px; }</style>
</head>
<body>

<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #8B0000">
  <div>
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:4px">War Eagle Index · Engagement Summary</div>
    <h1 style="font-size:24px;font-weight:700;color:#111827">${studentName}</h1>
    <div style="color:#6b7280;font-size:12px;margin-top:3px">${studentEmail}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;color:#9ca3af">School Year ${schoolYear}</div>
    <div style="font-size:11px;color:#9ca3af;margin-top:2px">Generated ${generatedDate}</div>
  </div>
</div>

<table style="width:100%;border-collapse:collapse;margin-bottom:24px">
  <tr>
    <td style="width:25%;padding:0 8px 0 0">
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:26px;font-weight:700;color:#8B0000">${totalAnswered}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">Surveys completed</div>
      </div>
    </td>
    <td style="width:25%;padding:0 8px">
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:26px;font-weight:700;color:#374151">${allRatings.length}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">Total ratings</div>
      </div>
    </td>
    <td style="width:25%;padding:0 8px">
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:26px;font-weight:700;color:#8B0000">${allRatings.length ? avgChallenge.toFixed(1) : "—"}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">Avg challenge</div>
      </div>
    </td>
    <td style="width:25%;padding:0 0 0 8px">
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:26px;font-weight:700;color:#8B0000">${allRatings.length ? avgLove.toFixed(1) : "—"}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">Avg love</div>
      </div>
    </td>
  </tr>
</table>

${allRatings.length > 0 ? quadrantTable : ""}

${eiWindows.length > 0 ? `<h2 style="font-size:14px;font-weight:700;color:#111827;margin-bottom:14px">Survey History — Engagement Index</h2>${windowRows}` : `<div style="text-align:center;color:#9ca3af;padding:40px 0;font-size:14px">No engagement survey responses on record.</div>`}

<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between">
  <span style="font-size:10px;color:#9ca3af">War Eagle Index · Woodward Academy</span>
  <span style="font-size:10px;color:#9ca3af">Confidential — For educator use only</span>
</div>

</body>
</html>`;
}
