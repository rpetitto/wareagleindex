import {
  db,
  secrets,
  storage,
  workflow,
  NonRetryableError,
  type WorkflowContinuation,
  type WorkflowCtx,
} from "flingit";

// ─── Config ───────────────────────────────────────────────────────────────────

// The Cloudinary folder photos are written to. This is the folder's immutable
// external_id (the `c-…` id that appears in the Media Library URL). It can be
// overridden with a CLOUDINARY_FOLDER_ID secret, which may hold either another
// external_id or a plain folder path like "students/photos".
const DEFAULT_FOLDER_ID = "c-82e34e7827a47f1781db6dec700da2";

// Photos uploaded per workflow step. Each step should stay well under a minute.
const BATCH_SIZE = 50;
// Concurrent uploads inside a batch.
const UPLOAD_CONCURRENCY = 6;
// Failure details retained on the log row.
const MAX_LOGGED_ERRORS = 25;

export type PhotoNaming = "auto" | "bare" | "ext";
type FolderMode = "dynamic" | "fixed";

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folderId: string;
}

function optionalSecret(name: string): string | null {
  try {
    const v = secrets.get(name);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function getCloudinaryConfig(): CloudinaryConfig {
  const cloudName = optionalSecret("CLOUDINARY_CLOUD_NAME");
  const apiKey = optionalSecret("CLOUDINARY_API_KEY");
  const apiSecret = optionalSecret("CLOUDINARY_API_SECRET");
  const missing = [
    !cloudName && "CLOUDINARY_CLOUD_NAME",
    !apiKey && "CLOUDINARY_API_KEY",
    !apiSecret && "CLOUDINARY_API_SECRET",
  ].filter(Boolean);
  if (missing.length) {
    throw new NonRetryableError(`Missing Cloudinary secrets: ${missing.join(", ")}`);
  }
  return {
    cloudName: cloudName!,
    apiKey: apiKey!,
    apiSecret: apiSecret!,
    folderId: optionalSecret("CLOUDINARY_FOLDER_ID") ?? DEFAULT_FOLDER_ID,
  };
}

export function cloudinaryConfigStatus(): { configured: boolean; missing: string[]; folderId: string } {
  const missing = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].filter(
    (name) => !optionalSecret(name)
  );
  return {
    configured: missing.length === 0,
    missing,
    folderId: optionalSecret("CLOUDINARY_FOLDER_ID") ?? DEFAULT_FOLDER_ID,
  };
}

// ─── Cloudinary API helpers ───────────────────────────────────────────────────

async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Cloudinary signature: sha1 of the signed params (sorted, `k=v` joined by &)
// with the api_secret appended.
async function signParams(params: Record<string, string>, apiSecret: string): Promise<string> {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return sha1Hex(toSign + apiSecret);
}

interface AdminResponse<T> {
  ok: boolean;
  status: number;
  body: T | null;
  error?: string;
}

async function adminGet<T>(cfg: CloudinaryConfig, path: string): Promise<AdminResponse<T>> {
  const auth = btoa(`${cfg.apiKey}:${cfg.apiSecret}`);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/${path}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const message =
      (parsed as { error?: { message?: string } } | null)?.error?.message ?? text.slice(0, 300);
    // 401/403 mean the credentials are wrong — retrying will never help.
    if (res.status === 401 || res.status === 403) {
      throw new NonRetryableError(`Cloudinary admin API ${res.status}: ${message}`);
    }
    return { ok: false, status: res.status, body: null, error: message };
  }
  return { ok: true, status: res.status, body: parsed as T };
}

interface CloudinaryFolder {
  name: string;
  path: string;
  external_id?: string;
}

interface FoldersResponse {
  folders: CloudinaryFolder[];
  next_cursor?: string | null;
}

function isExternalId(value: string): boolean {
  // Folder external ids are a long hex string, optionally prefixed with "c-".
  return /^(c-)?[0-9a-f]{20,}$/i.test(value.trim());
}

function normalizeExternalId(value: string): string {
  return value.trim().toLowerCase().replace(/^c-/, "");
}

async function listFolders(cfg: CloudinaryConfig, parentPath: string | null): Promise<CloudinaryFolder[]> {
  const base = parentPath ? `folders/${encodeURI(parentPath)}` : "folders";
  const out: CloudinaryFolder[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    const qs = `?max_results=500${cursor ? `&next_cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res: AdminResponse<FoldersResponse> = await adminGet<FoldersResponse>(cfg, base + qs);
    if (!res.ok || !res.body) break;
    out.push(...(res.body.folders ?? []));
    cursor = res.body.next_cursor ?? null;
    if (!cursor) break;
  }
  return out;
}

/**
 * Turn the configured folder id into a folder path.
 *
 * A plain path (e.g. "students/photos") is used as-is. An external id is looked
 * up by walking the folder tree breadth-first until a matching external_id is
 * found.
 */
export async function resolveFolderPath(cfg: CloudinaryConfig): Promise<string> {
  const raw = cfg.folderId.trim();
  if (!isExternalId(raw)) return raw.replace(/^\/+|\/+$/g, "");

  const target = normalizeExternalId(raw);
  const queue: (string | null)[] = [null];
  let visited = 0;
  while (queue.length && visited < 100) {
    const parent = queue.shift() ?? null;
    visited++;
    const folders = await listFolders(cfg, parent);
    for (const f of folders) {
      if (f.external_id && normalizeExternalId(f.external_id) === target) return f.path;
    }
    for (const f of folders) queue.push(f.path);
  }
  throw new NonRetryableError(
    `Could not find a Cloudinary folder with id "${raw}". Set CLOUDINARY_FOLDER_ID to the folder path instead.`
  );
}

interface CloudinaryResource {
  public_id: string;
  asset_folder?: string;
  display_name?: string;
  format?: string;
}

interface ResourcesResponse {
  resources: CloudinaryResource[];
  next_cursor?: string | null;
}

/**
 * List what is already in the target folder.
 *
 * Product environments in dynamic-folder mode answer `resources/by_asset_folder`;
 * fixed-folder environments don't, and there the folder is a public_id prefix.
 * Which one answers also tells us how to address assets on upload, so the mode
 * is returned alongside the resources.
 */
async function listFolderAssets(
  cfg: CloudinaryConfig,
  folderPath: string
): Promise<{ mode: FolderMode; resources: CloudinaryResource[] }> {
  const collect = async (base: string): Promise<CloudinaryResource[] | null> => {
    const out: CloudinaryResource[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 20; page++) {
      const qs = `${base}&max_results=500${cursor ? `&next_cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res: AdminResponse<ResourcesResponse> = await adminGet<ResourcesResponse>(cfg, qs);
      if (!res.ok || !res.body) return page === 0 ? null : out;
      out.push(...(res.body.resources ?? []));
      cursor = res.body.next_cursor ?? null;
      if (!cursor) break;
    }
    return out;
  };

  const dynamic = await collect(
    `resources/by_asset_folder?asset_folder=${encodeURIComponent(folderPath)}`
  );
  if (dynamic !== null) return { mode: "dynamic", resources: dynamic };

  const fixed = await collect(
    `resources/image/upload?type=upload&prefix=${encodeURIComponent(folderPath + "/")}`
  );
  return { mode: "fixed", resources: fixed ?? [] };
}

interface UploadResult {
  ok: boolean;
  publicId?: string;
  error?: string;
  retryable?: boolean;
}

async function uploadToCloudinary(
  cfg: CloudinaryConfig,
  opts: { folderPath: string; mode: FolderMode; publicId: string; file: string | Blob }
): Promise<UploadResult> {
  const signed: Record<string, string> = {
    // `folder` is prepended to the public_id in fixed-folder mode; dynamic-folder
    // environments want `asset_folder`, which leaves the public_id alone.
    ...(opts.mode === "dynamic"
      ? { asset_folder: opts.folderPath }
      : { folder: opts.folderPath }),
    format: "jpg",
    invalidate: "true",
    overwrite: "true",
    public_id: opts.publicId,
    timestamp: String(Math.floor(Date.now() / 1000)),
    unique_filename: "false",
    use_filename: "false",
  };
  const signature = await signParams(signed, cfg.apiSecret);

  const form = new FormData();
  for (const [k, v] of Object.entries(signed)) form.append(k, v);
  form.append("api_key", cfg.apiKey);
  form.append("signature", signature);
  if (typeof opts.file === "string") form.append("file", opts.file);
  else form.append("file", opts.file, `${opts.publicId}.jpg`);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const text = await res.text();
  let parsed: { public_id?: string; error?: { message?: string } } | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new NonRetryableError(
        `Cloudinary upload ${res.status}: ${parsed?.error?.message ?? text.slice(0, 200)}`
      );
    }
    return {
      ok: false,
      error: `${res.status}: ${parsed?.error?.message ?? text.slice(0, 200)}`,
      retryable: res.status === 420 || res.status === 429 || res.status >= 500,
    };
  }
  return { ok: true, publicId: parsed?.public_id };
}

// ─── Veracross ────────────────────────────────────────────────────────────────

interface VCStudentLite {
  id: number;
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
}

interface VCPhotoLite {
  person_id: number;
  download_url: string;
}

async function getVCToken(): Promise<string> {
  const school = secrets.get("VERACROSS_SCHOOL");
  const res = await fetch(`https://accounts.veracross.com/${school}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: secrets.get("VERACROSS_CLIENT_ID"),
      client_secret: secrets.get("VERACROSS_CLIENT_SECRET"),
      scope: "students:list person_photos:list",
    }),
  });
  if (!res.ok) throw new Error(`Veracross token error: ${res.status}`);
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(`Veracross auth failed: ${data.error ?? "no token"}`);
  return data.access_token;
}

// Veracross paginates through request headers, not query params.
async function vcList<T>(path: string, token: string, maxPages = 20): Promise<T[]> {
  const school = secrets.get("VERACROSS_SCHOOL");
  const PAGE_SIZE = 1000;
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(`https://api.veracross.com/${school}/v3/${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Page-Size": String(PAGE_SIZE),
        "X-Page-Number": String(page),
      },
    });
    if (!res.ok) throw new Error(`Veracross API ${res.status}: /${path}`);
    const json = (await res.json()) as { data?: T[] };
    const records = json.data ?? [];
    all.push(...records);
    if (records.length < PAGE_SIZE) break;
  }
  return all;
}

// ─── Work list ────────────────────────────────────────────────────────────────

interface PhotoJob {
  id: number; // Veracross student id — the "ID#" the file is named after
  url: string; // signed Veracross download URL (expires in ~1 day)
  publicId: string; // Cloudinary public_id to write (overwrites if it exists)
}

function batchKey(runId: string, index: number): string {
  return `cloudinary-photo-import/${runId}/batch-${index}.json`;
}

/** Existing asset public_ids, keyed by the student id encoded in their name. */
function indexExistingAssets(
  resources: CloudinaryResource[],
  mode: FolderMode,
  folderPath: string
): { byId: Map<string, string>; withExtension: number; total: number } {
  const byId = new Map<string, string>();
  let withExtension = 0;
  for (const r of resources) {
    let publicId = r.public_id;
    if (mode === "fixed" && folderPath && publicId.startsWith(folderPath + "/")) {
      // The folder param is prepended on upload in fixed-folder mode, so store
      // the id relative to the folder.
      publicId = publicId.slice(folderPath.length + 1);
    }
    const leaf = publicId.split("/").pop() ?? publicId;
    const bare = leaf.replace(/\.(jpe?g|png|gif|webp|heic)$/i, "");
    if (!/^\d+$/.test(bare)) continue;
    if (leaf !== bare) withExtension++;
    byId.set(bare, publicId);
  }
  return { byId, withExtension, total: resources.length };
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

workflow(
  "cloudinary-photo-import",
  {
    async start(ctx: WorkflowCtx): Promise<WorkflowContinuation> {
      ctx.set("startTime", Date.now());
      const logId = (await ctx.get("logId")) as string;
      const naming = ((await ctx.get("naming")) as PhotoNaming) ?? "auto";
      const cfg = getCloudinaryConfig();

      const folderPath = await resolveFolderPath(cfg);
      const { mode, resources } = await listFolderAssets(cfg, folderPath);
      const existing = indexExistingAssets(resources, mode, folderPath);

      // Match whatever the folder already uses so re-runs overwrite in place
      // rather than creating a second copy under a different public_id.
      const useExtension =
        naming === "ext" ||
        (naming === "auto" && existing.total > 0 && existing.withExtension > existing.total / 2);

      console.log(
        `photo-import: folder="${folderPath}" mode=${mode} existing=${existing.total} ` +
          `matched=${existing.byId.size} naming=${useExtension ? "ID.jpg" : "ID"}`
      );

      const token = await getVCToken();
      const [students, photos] = await Promise.all([
        vcList<VCStudentLite>("students", token, 10),
        vcList<VCPhotoLite>("person_photos", token, 20),
      ]);

      const photoByPerson = new Map<number, string>();
      for (const p of photos) if (p.download_url) photoByPerson.set(p.person_id, p.download_url);

      const jobs: PhotoJob[] = [];
      for (const s of students) {
        const url = photoByPerson.get(s.id);
        if (!url) continue;
        const id = String(s.id);
        jobs.push({
          id: s.id,
          url,
          publicId: existing.byId.get(id) ?? (useExtension ? `${id}.jpg` : id),
        });
      }

      // Batches live in storage — the scratchpad is not for bulk data.
      const batchCount = Math.ceil(jobs.length / BATCH_SIZE);
      for (let i = 0; i < batchCount; i++) {
        await storage.put(
          batchKey(ctx.runId, i),
          JSON.stringify(jobs.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)),
          { contentType: "application/json" }
        );
      }

      ctx.set("folderPath", folderPath);
      ctx.set("folderMode", mode);
      ctx.set("batchCount", batchCount);
      ctx.set("batchIndex", 0);
      ctx.set("uploaded", 0);
      ctx.set("failed", 0);
      ctx.set("skipped", students.length - jobs.length);

      await db
        .prepare(
          `UPDATE photo_import_logs
             SET total=?1, skipped=?2, folder_path=?3, students=?4
           WHERE id=?5`
        )
        .bind(jobs.length, students.length - jobs.length, folderPath, students.length, logId)
        .run();

      if (jobs.length === 0) return { step: "finalize" };
      return { step: "upload" };
    },

    async upload(ctx: WorkflowCtx): Promise<WorkflowContinuation> {
      const logId = (await ctx.get("logId")) as string;
      const batchIndex = (await ctx.get("batchIndex")) as number;
      const batchCount = (await ctx.get("batchCount")) as number;
      const folderPath = (await ctx.get("folderPath")) as string;
      const mode = ((await ctx.get("folderMode")) as FolderMode) ?? "fixed";
      let uploaded = (await ctx.get("uploaded")) as number;
      let failed = (await ctx.get("failed")) as number;

      // Admin pressed Cancel — stop cleanly instead of grinding through the rest.
      const log = await db
        .prepare(`SELECT status FROM photo_import_logs WHERE id=?1`)
        .bind(logId)
        .first<{ status: string }>();
      if (!log || log.status !== "running") return { step: "cleanup" };

      const cfg = getCloudinaryConfig();
      const file = await storage.get(batchKey(ctx.runId, batchIndex));
      if (!file) throw new NonRetryableError(`Missing batch ${batchIndex} for run ${ctx.runId}`);
      const jobs = JSON.parse(await file.text()) as PhotoJob[];

      const errors: { id: number; error: string }[] = [];
      let cursor = 0;
      const worker = async () => {
        while (cursor < jobs.length) {
          const job = jobs[cursor++];
          try {
            // Cloudinary fetches the signed Veracross URL itself; if that fails
            // (expired signature, blocked fetcher) we pull the bytes and post them.
            let result = await uploadToCloudinary(cfg, {
              folderPath,
              mode,
              publicId: job.publicId,
              file: job.url,
            });
            if (!result.ok && !result.retryable) {
              const res = await fetch(job.url);
              if (res.ok) {
                result = await uploadToCloudinary(cfg, {
                  folderPath,
                  mode,
                  publicId: job.publicId,
                  file: await res.blob(),
                });
              }
            }
            if (result.ok) uploaded++;
            else {
              failed++;
              errors.push({ id: job.id, error: result.error ?? "unknown error" });
            }
          } catch (err) {
            if (err instanceof NonRetryableError) throw err;
            failed++;
            errors.push({ id: job.id, error: String(err).slice(0, 200) });
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, jobs.length) }, () => worker())
      );

      ctx.set("uploaded", uploaded);
      ctx.set("failed", failed);
      ctx.set("batchIndex", batchIndex + 1);

      if (errors.length) {
        const row = await db
          .prepare(`SELECT errors FROM photo_import_logs WHERE id=?1`)
          .bind(logId)
          .first<{ errors: string | null }>();
        const previous = row?.errors ? (JSON.parse(row.errors) as typeof errors) : [];
        await db
          .prepare(`UPDATE photo_import_logs SET errors=?1 WHERE id=?2`)
          .bind(JSON.stringify([...previous, ...errors].slice(0, MAX_LOGGED_ERRORS)), logId)
          .run();
      }
      await db
        .prepare(`UPDATE photo_import_logs SET uploaded=?1, failed=?2 WHERE id=?3`)
        .bind(uploaded, failed, logId)
        .run();

      if (batchIndex + 1 >= batchCount) return { step: "cleanup" };
      return { step: "upload" };
    },

    async cleanup(ctx: WorkflowCtx): Promise<WorkflowContinuation> {
      const batchCount = ((await ctx.get("batchCount")) as number) ?? 0;
      for (let i = 0; i < batchCount; i++) {
        await storage.delete(batchKey(ctx.runId, i)).catch(() => {});
      }
      return { step: "finalize" };
    },

    async finalize(ctx: WorkflowCtx): Promise<WorkflowContinuation> {
      const logId = (await ctx.get("logId")) as string;
      const startTime = (await ctx.get("startTime")) as number;
      const uploaded = ((await ctx.get("uploaded")) as number) ?? 0;
      const failed = ((await ctx.get("failed")) as number) ?? 0;

      await db
        .prepare(
          `UPDATE photo_import_logs
             SET status = CASE WHEN status='running' THEN 'ok' ELSE status END,
                 duration_ms=?1
           WHERE id=?2`
        )
        .bind(Date.now() - startTime, logId)
        .run();

      return { done: true, result: { uploaded, failed } };
    },
  },
  { maxAttempts: 3, stepTimeoutMS: 180000 }
);

export async function startPhotoImportWorkflow(logId: string, naming: PhotoNaming): Promise<string> {
  const run = await workflow.start("cloudinary-photo-import", { logId, naming });
  return run.runId;
}

/** Marks the log row failed so the running workflow stops at its next step. */
export async function markPhotoImportFailed(logId: string, message: string): Promise<void> {
  await db
    .prepare(`UPDATE photo_import_logs SET status='error', error_message=?1 WHERE id=?2`)
    .bind(message, logId)
    .run();
}

/** Resolves the configured folder id to its path — used by the admin UI. */
export async function describeTargetFolder(): Promise<{ folderId: string; folderPath?: string; error?: string }> {
  const status = cloudinaryConfigStatus();
  if (!status.configured) {
    return { folderId: status.folderId, error: `Missing secrets: ${status.missing.join(", ")}` };
  }
  try {
    const cfg = getCloudinaryConfig();
    return { folderId: cfg.folderId, folderPath: await resolveFolderPath(cfg) };
  } catch (err) {
    return { folderId: status.folderId, error: String(err instanceof Error ? err.message : err) };
  }
}
