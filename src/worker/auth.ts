import { db, secrets } from "flingit";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "student" | "teacher" | "admin";
  picture: string | null;
  google_id: string;
  veracross_id: string | null;
}

export async function getSessionUser(c: Context): Promise<SessionUser | null> {
  const sessionId = getCookie(c, "session");
  if (!sessionId) return null;

  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.picture, u.google_id, u.veracross_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?1 AND s.expires_at > datetime('now')`
    )
    .bind(sessionId)
    .first<SessionUser>();

  return row || null;
}

export function sessionCookieHeader(sessionId: string, secure: boolean): string {
  const maxAge = 60 * 60 * 24 * 7;
  return `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookieHeader(): string {
  return `session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getRedirectUri(requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${url.protocol}//${url.host}/api/auth/callback`;
}

export function buildGoogleAuthUrl(redirectUri: string): string {
  const clientId = secrets.get("GOOGLE_CLIENT_ID");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<{ email: string; name: string; picture: string; sub: string }> {
  const clientId = secrets.get("GOOGLE_CLIENT_ID");
  const clientSecret = secrets.get("GOOGLE_CLIENT_SECRET");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokens = (await tokenRes.json()) as Record<string, string>;
  if (!tokens.access_token) throw new Error("Failed to get access token from Google");

  const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  const user = (await userRes.json()) as Record<string, string>;
  return { email: user.email, name: user.name, picture: user.picture, sub: user.sub };
}

export function getAdminEmails(): string[] {
  try {
    return secrets
      .get("ADMIN_EMAILS")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function requireRole(
  c: Context,
  ...roles: string[]
): Promise<SessionUser | Response> {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401) as unknown as Response;
  if (!roles.includes(user.role))
    return c.json({ error: "Forbidden" }, 403) as unknown as Response;
  return user;
}
