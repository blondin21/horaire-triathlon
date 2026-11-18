// Sessions : cookie signé (HMAC-SHA256), mots de passe hachés avec scrypt. Aucune dépendance externe.
import { createHmac, createHash, timingSafeEqual, scryptSync, randomBytes } from "node:crypto";

export const COOKIE = "hdp_session";
const secret = () => process.env.SESSION_SECRET || "";
// La connexion exige SESSION_SECRET (16 caractères minimum) et INVITE_CODE.
export const configured = () => secret().length >= 16 && !!process.env.INVITE_CODE;

const hmac = (p) => createHmac("sha256", secret()).update(p).digest("base64url");
const same = (a, b) => {
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
export function getUser(req) {
  const c = (req.headers.get("cookie") || "").split(/;\s*/).find((x) => x.startsWith(COOKIE + "="));
  return c ? verify(decodeURIComponent(c.slice(COOKIE.length + 1))) : null;
}
export const setCookie = (token, maxAge, secure) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;

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
export const emailKey = (e) => "user:" + createHash("sha256").update(e).digest("hex").slice(0, 32);
export const sameCode = (c) => {
  const h = (v) => createHash("sha256").update(String(v ?? "")).digest();
  return !!process.env.INVITE_CODE && timingSafeEqual(h(c), h(process.env.INVITE_CODE));
};
