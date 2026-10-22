-- Sistema Alra · estrutura do banco (rode uma vez no SQL Editor do Supabase)

-- 1. Documentos do sistema (equipe, clientes, pautas, captações, etc.)
create table if not exists public.docs (
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (col, id)
);
create index if not exists docs_col_idx on public.docs (col);
create index if not exists docs_portal_idx on public.docs ((data->>'portalToken')) where col = 'clientes';
create index if not exists docs_cliente_idx on public.docs ((data->>'clienteId')) where col = 'pecas';

-- 2. Administradores iniciais (podem entrar mesmo antes de estarem na Equipe)
create table if not exists public.admins (email text primary key);
alter table public.admins enable row level security;  -- sem políticas: ninguém lê pelo navegador
insert into public.admins (email) values ('pablo@alramarketing.com.br'), ('pablosansouza@gmail.com') on conflict do nothing;

-- 3. Quem pode entrar: administradores ou pessoas da Equipe com e-mail cadastrado
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where lower(email) = lower(coalesce(auth.jwt()->>'email', '')));
$$;
create or replace function public.is_member() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'email', '') <> '' and (
    public.is_admin() or exists (select 1 from docs where col = 'pessoas' and lower(data->>'email') = lower(auth.jwt()->>'email'))
  );
$$;
grant execute on function public.is_admin(), public.is_member() to authenticated;

alter table public.docs enable row level security;
drop policy if exists docs_rw on public.docs;
create policy docs_rw on public.docs for all to authenticated using (public.is_member()) with check (public.is_member());

-- 4. Tempo real
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- 5. Arquivos: "arquivos" (artes e fotos, leitura pública por link) e "backups" (privado)
insert into storage.buckets (id, name, public, file_size_limit) values ('arquivos', 'arquivos', true, 52428800) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('backups', 'backups', false) on conflict (id) do nothing;
drop policy if exists arquivos_insert on storage.objects;
drop policy if exists arquivos_update on storage.objects;
drop policy if exists arquivos_delete on storage.objects;
create policy arquivos_insert on storage.objects for insert to authenticated with check (bucket_id = 'arquivos' and public.is_member());
create policy arquivos_update on storage.objects for update to authenticated using (bucket_id = 'arquivos' and public.is_member());
create policy arquivos_delete on storage.objects for delete to authenticated using (bucket_id = 'arquivos' and public.is_member());
