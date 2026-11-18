// Sessions : cookie signé (HMAC-SHA256), mots de passe hachés avec scrypt. Aucune dépendance externe.
// Rôles : "admin" (gère les utilisateurs) et "editor" (modifie tout). Sans session : invité (lecture des restitutions).
import { createHmac, createHash, timingSafeEqual, scryptSync, randomBytes } from "node:crypto";
import { getUser as dbGetUser, dbConfigured } from "./db.mjs";

export const COOKIE = "hdp_session";
const secret = () => process.env.SESSION_SECRET || "";
export const adminEmail = () => (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
// La connexion exige SESSION_SECRET (16 caractères minimum) et la base de données.
export const configured = () => secret().length >= 16 && dbConfigured();

const hmac = (p) => createHmac("sha256", secret()).update(p).digest("base64url");
export const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export function sign(email, days = 30) {
  const p = Buffer.from(JSON.stringify({ e: email, x: Date.now() + days * 864e5 })).toString("base64url");
  return p + "." + hmac(p);
}
function verify(token) {
  if (!token || !secret()) return null;
  const [p, m] = token.split(".");
  if (!p || !m || !same(m, hmac(p))) return null;
  try {
    const d = JSON.parse(Buffer.from(p, "base64url").toString());
    return d.x > Date.now() && typeof d.e === "string" ? d.e : null;
  } catch {
    return null;
  }
}
// Renvoie { email, role } si la session est valide ET que le compte existe toujours (un accès supprimé est révoqué aussitôt).
export async function getSession(req) {
  if (!configured()) return null;
  const c = (req.headers.get("cookie") || "").split(/;\s*/).find((x) => x.startsWith(COOKIE + "="));
  const email = c ? verify(decodeURIComponent(c.slice(COOKIE.length + 1))) : null;
  if (!email) return null;
  const u = await dbGetUser(email);
  if (!u || !u.pw_hash) return null;
  return { email, role: email === adminEmail() ? "admin" : u.role };
}
export const setCookie = (token, maxAge, secure) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
export const isSecure = (req) => new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";

export function hashPw(pw) {
  const salt = randomBytes(16);
  return { salt: salt.toString("base64"), hash: scryptSync(pw, salt, 64).toString("base64") };
}
export function checkPw(pw, u) {
  const h = scryptSync(pw, Buffer.from(u.salt, "base64"), 64);
  const e = Buffer.from(u.hash, "base64");
  return h.length === e.length && timingSafeEqual(h, e);
}
export const DUMMY = { salt: Buffer.alloc(16).toString("base64"), hash: Buffer.alloc(64).toString("base64") };

// Jeton d'activation (lien envoyé à la personne) : on ne stocke que son empreinte.
export const tokenHash = (t) => createHash("sha256").update(String(t)).digest("hex");
export const newToken = () => {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: tokenHash(token), exp: Date.now() + 7 * 864e5 };
};
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
