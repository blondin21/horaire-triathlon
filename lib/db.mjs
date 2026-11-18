// Accès à la base Neon (Postgres serverless, par HTTP). Toutes les requêtes SQL de l'application sont ici.
// Variable lue : DATABASE_URL (injectée par l'intégration Neon de Vercel) ou POSTGRES_URL.
import { neon } from "@neondatabase/serverless";

const url = () => process.env.DATABASE_URL || process.env.POSTGRES_URL;
export const dbConfigured = () => !!url();

let client;
const sql = (...a) => (client ??= neon(url()))(...a);

let ready;
async function init() {
  const run = async (p) => {
    try {
      await p;
    } catch (e) {
      if (!["23505", "42P07", "42710"].includes(e?.code)) throw e; // création concurrente : on ignore
    }
  };
  await run(sql`create table if not exists hdp_users (email text primary key, role text not null default 'editor', pw_salt text, pw_hash text, token_hash text, token_exp bigint, created_at bigint not null)`);
  await run(sql`create table if not exists hdp_routes (id text primary key, name text not null, km double precision not null default 0, updated_at bigint not null, data jsonb not null)`);
  await run(sql`create table if not exists hdp_gpx (route_id text not null, sport text not null, name text not null, content text not null, primary key (route_id, sport))`);
  await run(sql`create table if not exists hdp_fails (k text primary key, n integer not null, until_ts bigint not null)`);
}
const ready_ = () => (ready ??= init().catch((e) => ((ready = null), Promise.reject(e))));

const num = (v) => (v == null ? null : Number(v)); // bigint revient en texte avec Neon

/* ---------- Utilisateurs ---------- */
export async function getUser(email) {
  await ready_();
  const r = await sql`select email, role, pw_salt, pw_hash, token_hash, token_exp from hdp_users where email = ${email}`;
  return r[0] ? { ...r[0], token_exp: num(r[0].token_exp) } : null;
}
export async function listUsers() {
  await ready_();
  const r = await sql`select email, role, (pw_hash is not null) as active, token_exp from hdp_users order by created_at`;
  return r.map((u) => ({ email: u.email, role: u.role, active: !!u.active, pending: !u.active && num(u.token_exp) > Date.now() }));
}
export async function createUser(email, role, tokenHash, exp) {
  await ready_();
  await sql`insert into hdp_users (email, role, token_hash, token_exp, created_at) values (${email}, ${role}, ${tokenHash}, ${exp}, ${Date.now()})`;
}
export async function seedAdmin(email, salt, hash) {
  await ready_();
  await sql`insert into hdp_users (email, role, pw_salt, pw_hash, created_at) values (${email}, 'admin', ${salt}, ${hash}, ${Date.now()})
    on conflict (email) do update set pw_salt = excluded.pw_salt, pw_hash = excluded.pw_hash, role = 'admin'`;
}
export async function setToken(email, tokenHash, exp) {
  await ready_();
  await sql`update hdp_users set token_hash = ${tokenHash}, token_exp = ${exp} where email = ${email}`;
}
export async function userByToken(tokenHash) {
  await ready_();
  const r = await sql`select email, role, token_exp from hdp_users where token_hash = ${tokenHash}`;
  return r[0] ? { ...r[0], token_exp: num(r[0].token_exp) } : null;
}
export async function setPassword(email, salt, hash) {
  await ready_();
  await sql`update hdp_users set pw_salt = ${salt}, pw_hash = ${hash}, token_hash = null, token_exp = null where email = ${email}`;
}
export async function setRole(email, role) {
  await ready_();
  await sql`update hdp_users set role = ${role} where email = ${email}`;
}
export async function deleteUser(email) {
  await ready_();
  await sql`delete from hdp_users where email = ${email}`;
}

/* ---------- Limitation des tentatives de connexion ---------- */
export async function getFail(k) {
  await ready_();
  const r = await sql`select n, until_ts from hdp_fails where k = ${k}`;
  return r[0] ? { n: Number(r[0].n), until: num(r[0].until_ts) } : null;
}
export async function setFail(k, n, until) {
  await ready_();
  await sql`insert into hdp_fails (k, n, until_ts) values (${k}, ${n}, ${until}) on conflict (k) do update set n = excluded.n, until_ts = excluded.until_ts`;
}
export async function clearFail(k) {
  await ready_();
  await sql`delete from hdp_fails where k = ${k}`;
}

/* ---------- Parcours et GPX ---------- */
export async function listRoutes() {
  await ready_();
  const r = await sql`select id, name, km, updated_at from hdp_routes order by updated_at desc`;
  return r.map((x) => ({ id: x.id, name: x.name, km: Number(x.km), updatedAt: num(x.updated_at) }));
}
export async function getRoute(id) {
  await ready_();
  const r = await sql`select id, name, km, updated_at, data from hdp_routes where id = ${id}`;
  if (!r[0]) return null;
  const data = typeof r[0].data === "string" ? JSON.parse(r[0].data) : r[0].data;
  return { id: r[0].id, name: r[0].name, km: Number(r[0].km), updatedAt: num(r[0].updated_at), sports: data.sports };
}
export async function saveRoute(r) {
  await ready_();
  const data = JSON.stringify({ sports: r.sports });
  await sql`insert into hdp_routes (id, name, km, updated_at, data) values (${r.id}, ${r.name}, ${r.km}, ${r.updatedAt}, ${data}::jsonb)
    on conflict (id) do update set name = excluded.name, km = excluded.km, updated_at = excluded.updated_at, data = excluded.data`;
}
export async function deleteRoute(id) {
  await ready_();
  await sql`delete from hdp_gpx where route_id = ${id}`;
  await sql`delete from hdp_routes where id = ${id}`;
}
export async function getGpx(id, sport) {
  await ready_();
  const r = await sql`select name, content from hdp_gpx where route_id = ${id} and sport = ${sport}`;
  return r[0] || null;
}
export async function saveGpx(id, sport, name, content) {
  await ready_();
  await sql`insert into hdp_gpx (route_id, sport, name, content) values (${id}, ${sport}, ${name}, ${content})
    on conflict (route_id, sport) do update set name = excluded.name, content = excluded.content`;
}
