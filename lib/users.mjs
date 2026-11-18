// Gestion des accès (administrateur uniquement). GET : liste. POST { op, email, role } :
// create (crée l'accès et un lien d'activation), reset (nouveau lien), role, delete.
import { listUsers, getUser, createUser, setToken, setRole, deleteUser } from "./db.mjs";
import { getSession, newToken, adminEmail, validEmail } from "./session.mjs";

const json = (d, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const ROLES = ["editor", "admin"];

export default async function handle(req) {
  try {
    const s = await getSession(req);
    if (!s) return json({ error: "Connexion requise" }, 401);
    if (s.role !== "admin") return json({ error: "Réservé à l’administrateur" }, 403);

    if (req.method === "GET") {
      const adm = adminEmail();
      return json((await listUsers()).map((u) => ({ ...u, role: u.email === adm ? "admin" : u.role, locked: u.email === adm })));
    }
    if (req.method !== "POST") return json({ error: "Méthode non supportée" }, 405);
    if (!(req.headers.get("content-type") || "").includes("application/json")) return json({ error: "Type invalide" }, 415);

    const b = await req.json();
    const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
    if (!validEmail(email)) return json({ error: "Email invalide" }, 400);
    const existing = await getUser(email);

    if (b.op === "create") {
      if (existing) return json({ error: "Cet email a déjà un accès." }, 409);
      const role = ROLES.includes(b.role) ? b.role : "editor";
      const t = newToken();
      await createUser(email, role, t.hash, t.exp);
      return json({ email, role, token: t.token, expires: t.exp }, 201);
    }
    if (!existing) return json({ error: "Utilisateur introuvable" }, 404);
    if (b.op === "reset") {
      const t = newToken();
      await setToken(email, t.hash, t.exp);
      return json({ email, token: t.token, expires: t.exp });
    }
    if (email === adminEmail() || email === s.email) {
      return json({ error: "Cette opération n’est pas possible sur ton propre accès ni sur le compte administrateur principal." }, 400);
    }
    if (b.op === "role") {
      if (!ROLES.includes(b.role)) return json({ error: "Rôle invalide" }, 400);
      await setRole(email, b.role);
      return json({ ok: true });
    }
    if (b.op === "delete") {
      await deleteUser(email);
      return json({ ok: true });
    }
    return json({ error: "Opération inconnue" }, 400);
  } catch {
    return json({ error: "Erreur serveur" }, 500);
  }
}
