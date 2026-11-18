// Connexion par email + mot de passe. Les comptes sont stockés dans Netlify Blobs (magasin "auth").
// Création de compte : réservée aux personnes qui connaissent INVITE_CODE (et, si défini, listées dans EDITOR_EMAILS).
import { getStore } from "@netlify/blobs";
import { configured, sign, getUser, setCookie, hashPw, checkPw, DUMMY, emailKey, sameCode } from "../lib/session.mjs";

export const config = { path: "/api/auth/*" };

const json = (d, s = 200, h = {}) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...h },
  });

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const locked = async (store, k) => {
  const l = await store.get("fail:" + k, { type: "json" });
  return !!l && l.until > Date.now();
};
const bump = async (store, k, max = MAX_FAILS) => {
  const l = (await store.get("fail:" + k, { type: "json" })) || { n: 0, until: 0 };
  const n = l.until > Date.now() ? l.n : l.n + 1;
  await store.setJSON("fail:" + k, n >= max ? { n: 0, until: Date.now() + LOCK_MS } : { n, until: 0 });
};

export default async (req) => {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean)[2];
  const secure = url.protocol === "https:";

  if (action === "me" && req.method === "GET") return json({ email: getUser(req), configured: configured() });
  if (req.method !== "POST") return json({ error: "Méthode non supportée" }, 405);
  if (!(req.headers.get("content-type") || "").includes("application/json")) return json({ error: "Type invalide" }, 415);
  if (action === "logout") return json({ ok: true }, 200, { "set-cookie": setCookie("", 0, secure) });
  if (action !== "login" && action !== "signup") return json({ error: "Action inconnue" }, 404);
  if (!configured()) return json({ error: "La connexion n’est pas configurée sur ce site." }, 503);

  let b;
  try {
    b = await req.json();
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
  const pw = String(b.password || "").slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Email invalide" }, 400);
  const store = getStore({ name: "auth", consistency: "strong" });
  const key = emailKey(email);

  try {
    if (action === "signup") {
      if (pw.length < 8) return json({ error: "Le mot de passe doit contenir au moins 8 caractères." }, 400);
      if (await locked(store, "code")) return json({ error: "Trop de tentatives. Réessaie dans quelques minutes." }, 429);
      if (!sameCode(b.code)) {
        await bump(store, "code", 10);
        return json({ error: "Code d’invitation incorrect." }, 403);
      }
      const allow = (process.env.EDITOR_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
      if (allow.length && !allow.includes(email)) return json({ error: "Cet email n’est pas autorisé." }, 403);
      await store.setJSON(key, { email, ...hashPw(pw), createdAt: Date.now() });
      return json({ email }, 201, { "set-cookie": setCookie(sign(email), 30 * 86400, secure) });
    }
    // login
    if (await locked(store, key)) return json({ error: "Trop de tentatives. Réessaie dans quelques minutes." }, 429);
    const u = await store.get(key, { type: "json" });
    const ok = checkPw(pw, u || DUMMY) && !!u;
    if (!ok) {
      await bump(store, key);
      return json({ error: "Email ou mot de passe incorrect." }, 401);
    }
    await store.delete("fail:" + key);
    return json({ email }, 200, { "set-cookie": setCookie(sign(email), 30 * 86400, secure) });
  } catch {
    return json({ error: "Erreur serveur" }, 500);
  }
};
