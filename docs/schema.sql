-- Namespaced tables leave other applications untouched.
create table if not exists public.airport_snapshots (id text primary key check(id='main'), payload jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.airport_directory (code text primary key, name text not null, timezone text not null);
insert into public.airport_directory values ('UFA','Уфа','Asia/Yekaterinburg'),('SVO','Шереметьево','Europe/Moscow'),('DME','Домодедово','Europe/Moscow'),('VKO','Внуково','Europe/Moscow'),('ZIA','Жуковский','Europe/Moscow') on conflict do nothing;
create table if not exists public.airport_messages (id bigint primary key,published_at timestamptz not null,text text not null,url text not null,review boolean not null,processing_result jsonb not null);
create table if not exists public.airport_events (message_id bigint references public.airport_messages(id),airport text references public.airport_directory(code),direction text check(direction in ('dep','arr')),state text check(state in ('clear','restricted','partial','unknown')),effective_at timestamptz not null,time_basis text not null,primary key(message_id,airport,direction));
create table if not exists public.airport_intervals (airport text references public.airport_directory(code),direction text not null,state text not null,started_at timestamptz not null,ended_at timestamptz,observed_until timestamptz not null,duration_ms bigint not null,source_url text,primary key(airport,direction,started_at));
create table if not exists public.airport_collection_runs (id bigint generated always as identity primary key,checked_at timestamptz not null default now(),success boolean not null,error text,message_count int);
create schema if not exists airport_private;
revoke all on schema airport_private from public,anon,authenticated;
create table if not exists airport_private.ingest_credentials (id text primary key,token_hash text not null);
alter table airport_private.ingest_credentials enable row level security;
do $$ declare t text; begin foreach t in array array['airport_snapshots','airport_directory','airport_messages','airport_events','airport_intervals','airport_collection_runs'] loop execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon,authenticated',t); end loop; end $$;
grant select on public.airport_snapshots to anon,authenticated;
create policy airport_public_snapshot on public.airport_snapshots for select to anon,authenticated using(true);
-- Only a random, per-application ingestion token can write. No service_role key is needed.
create or replace function public.airport_ingest(p_token text,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare m jsonb; e jsonb; i jsonb; checkpoint timestamptz;
begin
 if not exists(select 1 from airport_private.ingest_credentials where id='main' and token_hash=encode(extensions.digest(p_token,'sha256'),'hex')) then raise exception 'Unauthorized'; end if;
 perform pg_advisory_xact_lock(716384209);
 if (p_payload->>'version')::int <> 1 or jsonb_typeof(p_payload->'messages') <> 'array' or jsonb_typeof(p_payload->'intervals') <> 'array' then raise exception 'Invalid payload'; end if;
 checkpoint:=to_timestamp((p_payload->>'checkedAt')::double precision/1000);
 if checkpoint < (select to_timestamp((payload->>'checkedAt')::double precision/1000) from public.airport_snapshots where id='main') then raise exception 'Older snapshot rejected'; end if;
 for m in select value from jsonb_array_elements(p_payload->'messages') loop
  insert into public.airport_messages values((m->>'id')::bigint,to_timestamp((m->>'at')::double precision/1000),m->>'text',m->>'url',(m->>'review')::boolean,m) on conflict(id) do update set text=excluded.text,review=excluded.review,processing_result=excluded.processing_result;
  delete from public.airport_events where message_id=(m->>'id')::bigint;
  for e in select value from jsonb_array_elements(m->'events') loop
   insert into public.airport_events values((m->>'id')::bigint,e->>'airport',e->>'direction',e->>'state',to_timestamp(coalesce(e->>'effectiveAt',m->>'at')::double precision/1000),coalesce(e->>'timeBasis','publication_estimate'));
  end loop;
 end loop;
 delete from public.airport_intervals;
 for i in select value from jsonb_array_elements(p_payload->'intervals') loop
  insert into public.airport_intervals values(i->>'airport',i->>'direction',i->>'state',to_timestamp((i->>'start')::double precision/1000),case when (i->>'end')::double precision=(p_payload->>'checkedAt')::double precision then null else to_timestamp((i->>'end')::double precision/1000) end,to_timestamp((i->>'end')::double precision/1000),(i->>'durationMs')::bigint,i->>'source');
 end loop;
 insert into public.airport_snapshots values('main',p_payload,now()) on conflict(id) do update set payload=excluded.payload,updated_at=now();
 insert into public.airport_collection_runs(checked_at,success,message_count) values(checkpoint,true,jsonb_array_length(p_payload->'messages'));
end $$;
revoke all on function public.airport_ingest(text,jsonb) from public;
grant execute on function public.airport_ingest(text,jsonb) to anon,authenticated;
create or replace function public.airport_log_failure(p_token text,p_error text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not exists(select 1 from airport_private.ingest_credentials where id='main' and token_hash=encode(extensions.digest(p_token,'sha256'),'hex')) then raise exception 'Unauthorized'; end if;
 insert into public.airport_collection_runs(success,error) values(false,left(p_error,200));
end $$;
revoke all on function public.airport_log_failure(text,text) from public;
grant execute on function public.airport_log_failure(text,text) to anon,authenticated;
