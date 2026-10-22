-- Sistema Alra · estrutura do banco em UM comando só (use se o editor recusar vários comandos)
do $SISTEMA$
begin
  execute $S0$create table if not exists public.docs (
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (col, id)
)$S0$;
  execute $S1$create index if not exists docs_col_idx on public.docs (col)$S1$;
  execute $S2$create index if not exists docs_portal_idx on public.docs ((data->>'portalToken')) where col = 'clientes'$S2$;
  execute $S3$create index if not exists docs_cliente_idx on public.docs ((data->>'clienteId')) where col = 'pecas'$S3$;
  execute $S4$create table if not exists public.admins (email text primary key)$S4$;
  execute $S5$alter table public.admins enable row level security$S5$;
  execute $S6$-- sem políticas: ninguém lê pelo navegador
insert into public.admins (email) values ('pablo@alramarketing.com.br'), ('pablosansouza@gmail.com') on conflict do nothing$S6$;
  execute $S7$create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where lower(email) = lower(coalesce(auth.jwt()->>'email', '')));
$$$S7$;
  execute $S8$create or replace function public.is_member() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'email', '') <> '' and (
    public.is_admin() or exists (select 1 from docs where col = 'pessoas' and lower(data->>'email') = lower(auth.jwt()->>'email'))
  );
$$$S8$;
  execute $S9$grant execute on function public.is_admin(), public.is_member() to authenticated$S9$;
  execute $S10$alter table public.docs enable row level security$S10$;
  execute $S11$drop policy if exists docs_rw on public.docs$S11$;
  execute $S12$create policy docs_rw on public.docs for all to authenticated using (public.is_member()) with check (public.is_member())$S12$;
  execute $S13$do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$$S13$;
  execute $S14$insert into storage.buckets (id, name, public, file_size_limit) values ('arquivos', 'arquivos', true, 52428800) on conflict (id) do nothing$S14$;
  execute $S15$insert into storage.buckets (id, name, public) values ('backups', 'backups', false) on conflict (id) do nothing$S15$;
  execute $S16$drop policy if exists arquivos_insert on storage.objects$S16$;
  execute $S17$drop policy if exists arquivos_update on storage.objects$S17$;
  execute $S18$drop policy if exists arquivos_delete on storage.objects$S18$;
  execute $S19$create policy arquivos_insert on storage.objects for insert to authenticated with check (bucket_id = 'arquivos' and public.is_member())$S19$;
  execute $S20$create policy arquivos_update on storage.objects for update to authenticated using (bucket_id = 'arquivos' and public.is_member())$S20$;
  execute $S21$create policy arquivos_delete on storage.objects for delete to authenticated using (bucket_id = 'arquivos' and public.is_member())$S21$;
end
$SISTEMA$;
