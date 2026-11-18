-- Tables de l'application. Elles sont créées automatiquement au premier appel de l'API ;
-- ce fichier sert de référence (ou à les créer à la main dans l'éditeur SQL de Neon).
create table if not exists hdp_users (
  email      text primary key,
  role       text not null default 'editor',
  pw_salt    text,
  pw_hash    text,
  token_hash text,
  token_exp  bigint,
  created_at bigint not null
);
create table if not exists hdp_routes (
  id         text primary key,
  name       text not null,
  km         double precision not null default 0,
  updated_at bigint not null,
  data       jsonb not null
);
create table if not exists hdp_gpx (
  route_id text not null,
  sport    text not null,
  name     text not null,
  content  text not null,
  primary key (route_id, sport)
);
create table if not exists hdp_fails (
  k        text primary key,
  n        integer not null,
  until_ts bigint not null
);
