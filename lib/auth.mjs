// Connexion par email + mot de passe. Les accès sont créés par l'administrateur (voir users.mjs).
// Actions : me, login, logout, activation (GET), activate, password.
import {
  getUser, seedAdmin, userByToken, setPassword, getFail, setFail, clearFail,
} from "./db.mjs";
import {
  configured, sign, getSession, setCookie, isSecure, hashPw, checkPw, DUMMY, same, adminEmail, tokenHash, validEmail,
} from "./session.mjs";

const json = (d, s = 200, h = {}) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...h },
  });

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const locked = async (k) => {
  const l = await getFail(k);
  return !!l && l.until > Date.now();
};
const bump = async (k) => {
  const l = (await getFail(k)) || { n: 0, until: 0 };
  const n = l.until > Date.now() ? l.n : l.n + 1;
  if (n >= MAX_FAILS) await setFail(k, 0, Date.now() + LOCK_MS);
  else await setFail(k, n, 0);
};
const session = (email, role, secure, status = 200) =>
  json({ email, role }, status, { "set-cookie": setCookie(sign(email), 30 * 86400, secure) });

export default async function handle(req) {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean)[2];
  const secure = isSecure(req);

  try {
    if (action === "me" && req.method === "GET") {
      if (!configured()) return json({ email: null, role: null, configured: false });
      const s = await getSession(req);
      return json({ email: s?.email || null, role: s?.role || null, configured: true });
    }
    if (action === "activation" && req.method === "GET") {
      if (!configured()) return json({ error: "La connexion n’est pas configurée sur ce site." }, 503);
      const u = await userByToken(tokenHash(url.searchParams.get("token") || ""));
      if (!u || u.token_exp < Date.now()) return json({ error: "Lien invalide ou expiré." }, 404);
      return json({ email: u.email });
    }
    if (req.method !== "POST") return json({ error: "Méthode non supportée" }, 405);
    if (!(req.headers.get("content-type") || "").includes("application/json")) return json({ error: "Type invalide" }, 415);
    if (action === "logout") return json({ ok: true }, 200, { "set-cookie": setCookie("", 0, secure) });
    if (!["login", "activate", "password"].includes(action)) return json({ error: "Action inconnue" }, 404);
    if (!configured()) return json({ error: "La connexion n’est pas configurée sur ce site." }, 503);

    let b;
    try {
      b = await req.json();
    } catch {
      return json({ error: "Requête invalide" }, 400);
    }
    const pw = String(b.password || "").slice(0, 200);

    if (action === "activate") {
      if (pw.length < 8) return json({ error: "Le mot de passe doit contenir au moins 8 caractères." }, 400);
      const u = await userByToken(tokenHash(b.token || ""));
      if (!u || u.token_exp < Date.now()) return json({ error: "Lien invalide ou expiré. Demande-en un nouveau à l’administrateur." }, 400);
      const h = hashPw(pw);
      await setPassword(u.email, h.salt, h.hash);
      return session(u.email, u.email === adminEmail() ? "admin" : u.role, secure);
    }

    if (action === "password") {
      const s = await getSession(req);
      if (!s) return json({ error: "Connexion requise" }, 401);
      if (pw.length < 8) return json({ error: "Le nouveau mot de passe doit contenir au moins 8 caractères." }, 400);
      const u = await getUser(s.email);
      if (!u || !checkPw(String(b.current || "").slice(0, 200), { salt: u.pw_salt, hash: u.pw_hash })) {
        return json({ error: "Mot de passe actuel incorrect." }, 403);
      }
      const h = hashPw(pw);
      await setPassword(s.email, h.salt, h.hash);
      return json({ ok: true });
    }

    // login
    const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
    if (!validEmail(email)) return json({ error: "Email invalide" }, 400);
    if (await locked(email)) return json({ error: "Trop de tentatives. Réessaie dans quelques minutes." }, 429);
    let u = await getUser(email);
    // Compte administrateur : créé à la première connexion avec ADMIN_EMAIL / ADMIN_PASSWORD
    const adm = adminEmail();
    if (!u && adm && email === adm && process.env.ADMIN_PASSWORD && same(pw, process.env.ADMIN_PASSWORD)) {
      const h = hashPw(pw);
      await seedAdmin(email, h.salt, h.hash);
      u = await getUser(email);
    }
    const ok = checkPw(pw, u && u.pw_hash ? { salt: u.pw_salt, hash: u.pw_hash } : DUMMY) && !!u && !!u.pw_hash;
    if (!ok) {
      await bump(email);
      return json({ error: "Email ou mot de passe incorrect. Si ton accès vient d’être créé, ouvre d’abord le lien d’activation reçu." }, 401);
    }
    await clearFail(email);
    return session(email, email === adm ? "admin" : u.role, secure);
  } catch {
    return json({ error: "Erreur serveur" }, 500);
  }
}
