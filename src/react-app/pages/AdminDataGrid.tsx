import { useEffect, useMemo, useState, useCallback } from "react";
import {
  DataEditor,
  GridCellKind,
  type GridColumn,
  type GridCell,
  type Item,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";

interface TableMeta {
  key: string;
  label: string;
  count: number;
}

interface TableData {
  key: string;
  label: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  truncated: boolean;
}

const COLUMN_TITLES: Record<string, string> = {
  name: "Name",
  email: "Email",
  veracross_id: "Veracross ID",
  role: "Role",
  has_photo: "Photo",
  created_at: "Created",
  subject: "Subject",
  grade_level: "Grade",
  school_year: "School Year",
  term: "Term",
  primary_teacher_name: "Primary Teacher",
  begin_date: "Begins",
  end_date: "Ends",
  student_name: "Student",
  student_vc_id: "Student VC ID",
  class_name: "Class",
  class_vc_id: "Class VC ID",
  class_status: "Status",
  last_synced_at: "Last Synced",
  teacher_name: "Teacher",
  teacher_vc_id: "Teacher VC ID",
};

function titleFor(col: string): string {
  return COLUMN_TITLES[col] ?? col.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function AdminDataGrid() {
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // Load the list of tables
  useEffect(() => {
    fetch("/api/admin/data-grid")
      .then((r) => r.json())
      .then((d) => {
        const t = (d as { tables: TableMeta[] }).tables ?? [];
        setTables(t);
        setLoading(false);
        if (t.length > 0) setActiveKey(t[0].key);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load the active table's data
  useEffect(() => {
    if (!activeKey) return;
    setTableLoading(true);
    setData(null);
    fetch(`/api/admin/data-grid/${activeKey}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d as TableData);
        setTableLoading(false);
      })
      .catch(() => setTableLoading(false));
  }, [activeKey]);

  const columns = useMemo<GridColumn[]>(() => {
    if (!data) return [];
    return data.columns.map((c) => ({
      title: titleFor(c),
      id: c,
      // rough auto-width based on title length; grid lets users resize
      width: Math.max(120, Math.min(280, titleFor(c).length * 9 + 40)),
    }));
  }, [data]);

  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [col, row] = cell;
      const colId = data?.columns[col];
      const value = colId ? data?.rows[row]?.[colId] : undefined;
      const display = value == null ? "" : String(value);
      return {
        kind: GridCellKind.Text,
        data: display,
        displayData: display,
        allowOverlay: true, // allows selecting/copying cell text; read-only (no onCellEdited)
        readonly: true,
      };
    },
    [data]
  );

  // Build CSV for the current table and trigger a download
  const exportCsv = useCallback(() => {
    if (!data) return;
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = data.columns.map((c) => esc(titleFor(c))).join(",");
    const body = data.rows.map((r) => data.columns.map((c) => esc(r[c])).join(",")).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  if (loading) {
    return <div className="text-center text-gray-400 py-12">Loading…</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Import Data</h1>
          <p className="text-sm text-gray-500 mt-0.5">Raw Veracross sync data. Admin-only.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSearch((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 bg-white px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search
          </button>
          <button
            onClick={exportCsv}
            disabled={!data}
            className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 bg-white px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Table selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tables.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveKey(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer border ${
              activeKey === t.key
                ? "bg-crimson text-white border-crimson"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {t.label}
            <span className={`ml-1.5 text-xs ${activeKey === t.key ? "text-white/70" : "text-gray-400"}`}>
              {t.count.toLocaleString()}
            </span>
          </button>
        ))}
      </div>

      {data?.truncated && (
        <div className="mb-3 text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
          Showing the first {data.rows.length.toLocaleString()} of {data.total.toLocaleString()} rows.
          Use Export CSV from a fresh sync, or refine in Veracross, to see the rest.
        </div>
      )}

      {/* Grid */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {tableLoading || !data ? (
          <div className="text-center text-gray-400 py-16">Loading table…</div>
        ) : data.rows.length === 0 ? (
          <div className="text-center text-gray-400 py-16">No rows in this table.</div>
        ) : (
          <DataEditor
            columns={columns}
            getCellContent={getCellContent}
            rows={data.rows.length}
            showSearch={showSearch}
            onSearchClose={() => setShowSearch(false)}
            getCellsForSelection={true}
            rowMarkers="number"
            smoothScrollX
            smoothScrollY
            width="100%"
            height={620}
          />
        )}
      </div>
    </div>
  );
}
