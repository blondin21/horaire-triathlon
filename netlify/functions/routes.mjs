// API des parcours. Stockage : Netlify Blobs (base clé/valeur intégrée, aucune configuration).
// Un blob JSON par parcours ("route:<id>") + un blob par GPX ("gpx:<id>:<discipline>").
// Disciplines : velo, nat (natation), cap (course à pied).
// Lecture publique (mode invité) ; écriture et téléchargement des GPX réservés aux personnes connectées.
import { getStore } from "@netlify/blobs";
import { getUser } from "../lib/session.mjs";

export const config = { path: ["/api/routes", "/api/routes/*"] };

const SPORTS = ["velo", "nat", "cap"];
const json = (d, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const num = (v, min, max, d = 0) => {
  v = Number(v);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
};
const str = (v, n) => String(v ?? "").slice(0, n);
const uid = () => crypto.randomUUID().slice(0, 6);

const cleanTrack = (t) =>
  Array.isArray(t) && t.length >= 2
    ? t.slice(0, 4000).map((p) => [num(p[0], -90, 90), num(p[1], -180, 180), num(p[2], 0, 3000)])
    : null;
const cleanPoints = (a) =>
  (Array.isArray(a) ? a : []).slice(0, 300).map((p) => ({
    id: str(p.id, 16) || uid(),
    name: str(p.name, 80),
    km: num(p.km, 0, 3000),
  }));
// Groupe : speed (km/h, vélo) ou pace (secondes par 100 m pour nat, par km pour cap).
// t = transition en minutes : T1 (natation → vélo) sur les groupes vélo, T2 (vélo → course) sur les groupes course.
const cleanGroups = (a) =>
  (Array.isArray(a) ? a : []).slice(0, 30).map((b) => ({
    id: str(b.id, 16) || uid(),
    name: str(b.name, 60),
    start: /^\d{1,2}:\d{2}$/.test(b.start) ? b.start : "07:00",
    speed: num(b.speed, 0, 90, 25),
    pace: num(b.pace, 0, 3600, 360),
    t: num(b.t, 0, 120, 0),
  }));
const totalKm = (track) => Math.round(track[track.length - 1][2] * 100) / 100;
const cleanGpx = (g) => (typeof g === "string" && g.length <= 4_000_000 && g.includes("<gpx") ? g : null);

const gpxProblem = (sports) => {
  for (const k of SPORTS) {
    const g = sports?.[k]?.gpx;
    if (g === undefined || g === null || cleanGpx(g)) continue;
    return typeof g === "string" && g.length > 4_000_000 ? [413, "Le fichier GPX est trop volumineux (4 Mo maximum)."] : [400, "Fichier GPX invalide."];
  }
  return null;
};
const DEF = {
  velo: { km: 40, g: [["Rapide", "07:00", { speed: 45, t: 2 }], ["Moyen", "07:30", { speed: 32, t: 3 }], ["Lent", "08:00", { speed: 22, t: 5 }]] },
  nat: { km: 1.5, g: [["Rapide", "07:00", { pace: 80 }], ["Moyen", "07:05", { pace: 105 }], ["Lent", "07:10", { pace: 135 }]] },
  cap: { km: 10, g: [["Rapide", "10:00", { pace: 240, t: 1 }], ["Moyen", "10:30", { pace: 330, t: 2 }], ["Lent", "11:00", { pace: 420, t: 3 }]] },
};
const endPoints = (km) => [{ id: uid(), name: "Départ", km: 0 }, { id: uid(), name: "Arrivée", km }];
const defaultSport = (k) => ({
  track: null,
  km: DEF[k].km,
  gpx: null,
  points: endPoints(DEF[k].km),
  bikes: DEF[k].g.map(([name, start, r]) => ({ id: uid(), name, start, speed: r.speed ?? 25, pace: r.pace ?? 360, t: r.t ?? 0 })),
});

// Anciens parcours (vélo seul, champs à la racine) => nouveau format à trois disciplines.
function normalize(r) {
  const sports = { ...(r.sports || {}) };
  if (!r.sports) {
    sports.velo = {
      track: r.track || null,
      km: r.km || 0,
      gpx: r.gpx || null,
      points: r.points || [],
      bikes: cleanGroups(r.bikes),
    };
  }
  for (const k of SPORTS) if (!sports[k]) sports[k] = defaultSport(k);
  return { id: r.id, name: r.name, updatedAt: r.updatedAt, km: sports.velo.km, sports };
}

// Fusionne les modifications b dans la discipline prev. Renvoie la discipline et le GPX éventuel à stocker.
function buildSport(prev, b = {}, fresh = false) {
  const s = { ...prev };
  const track = cleanTrack(b.track);
  if (track) {
    s.track = track;
    s.km = totalKm(track);
    if (fresh && !b.points) s.points = endPoints(s.km);
  } else if (b.km !== undefined && !s.track) {
    s.km = num(b.km, 0, 3000, s.km);
  }
  if (b.points) s.points = cleanPoints(b.points);
  if (b.bikes) s.bikes = cleanGroups(b.bikes);
  const gpx = track ? cleanGpx(b.gpx) : null;
  if (gpx) s.gpx = { name: str(b.gpxName, 120) || "parcours.gpx", size: gpx.length, updatedAt: Date.now() };
  return { s, gpx };
}

export default async (req) => {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","routes",id?,"gpx"?]
  const id = parts[2] ? parts[2].replace(/[^\w-]/g, "") : null;
  const store = getStore({ name: "parcours", consistency: "strong" });

  const user = getUser(req);
  if (req.method !== "GET") {
    if (!(req.headers.get("content-type") || "").includes("application/json")) return json({ error: "Type invalide" }, 415);
    if (!user) return json({ error: "Connexion requise" }, 401);
  }

  try {
    if (!id) {
      if (req.method === "GET") {
        const { blobs } = await store.list({ prefix: "route:" });
        const all = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
        return json(
          all
            .filter(Boolean)
            .map(normalize)
            .map((r) => ({ id: r.id, name: r.name, km: r.km, updatedAt: r.updatedAt }))
            .sort((a, b) => b.updatedAt - a.updatedAt)
        );
      }
      if (req.method === "POST") {
        const b = await req.json();
        const bad = gpxProblem(b.sports);
        if (bad) return json({ error: bad[1] }, bad[0]);
        const rid = crypto.randomUUID().slice(0, 8);
        const sports = {};
        const gpxs = {};
        for (const k of SPORTS) {
          const { s, gpx } = buildSport(defaultSport(k), b.sports?.[k], true);
          sports[k] = s;
          if (gpx) gpxs[k] = gpx;
        }
        const r = {
          id: rid,
          name: str(b.name, 80) || "Parcours sans nom",
          km: sports.velo.km,
          sports,
          updatedAt: Date.now(),
        };
        await Promise.all(Object.entries(gpxs).map(([k, g]) => store.set(`gpx:${rid}:${k}`, g)));
        await store.setJSON("route:" + rid, r);
        return json(r, 201);
      }
    } else {
      const key = "route:" + id;
      const raw = await store.get(key, { type: "json" });
      if (!raw) return json({ error: "Parcours introuvable" }, 404);
      const cur = normalize(raw);

      if (parts[3] === "gpx") {
        if (!user) return json({ error: "Connexion requise" }, 401);
        if (req.method !== "GET") return json({ error: "Méthode non supportée" }, 405);
        let sport = url.searchParams.get("sport");
        if (!SPORTS.includes(sport)) sport = "velo";
        let txt = await store.get(`gpx:${id}:${sport}`);
        if (!txt && sport === "velo") txt = await store.get("gpx:" + id); // ancien format
        if (!txt) return json({ error: "Aucun fichier GPX enregistré" }, 404);
        const fn = (cur.sports[sport].gpx?.name || "parcours.gpx").replace(/[^\w.\- ]/g, "_");
        return new Response(txt, {
          headers: {
            "content-type": "application/gpx+xml; charset=utf-8",
            "content-disposition": `attachment; filename="${fn}"`,
            "cache-control": "no-store",
          },
        });
      }
      if (req.method === "GET") return json(cur);
      if (req.method === "PUT") {
        const b = await req.json();
        const bad = gpxProblem(b.sports);
        if (bad) return json({ error: bad[1] }, bad[0]);
        const next = {
          ...cur,
          name: b.name !== undefined ? str(b.name, 80) || cur.name : cur.name,
          sports: { ...cur.sports },
          updatedAt: Date.now(),
        };
        const writes = [];
        for (const k of SPORTS) {
          if (!b.sports?.[k]) continue;
          const { s, gpx } = buildSport(cur.sports[k], b.sports[k]);
          next.sports[k] = s;
          if (gpx) writes.push(store.set(`gpx:${id}:${k}`, gpx));
        }
        next.km = next.sports.velo.km;
        await Promise.all(writes);
        await store.setJSON(key, next);
        return json({
          id,
          updatedAt: next.updatedAt,
          sports: Object.fromEntries(SPORTS.map((k) => [k, { km: next.sports[k].km, gpx: next.sports[k].gpx }])),
        });
      }
      if (req.method === "DELETE") {
        await store.delete(key);
        await Promise.all([...SPORTS.map((k) => store.delete(`gpx:${id}:${k}`)), store.delete("gpx:" + id)]);
        return json({ ok: true });
      }
    }
    return json({ error: "Méthode non supportée" }, 405);
  } catch (e) {
    return json({ error: "Erreur serveur" }, 500);
  }
};
