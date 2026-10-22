-- Já aplicado no Supabase (migração "senha_padrao_troca_obrigatoria").
-- Quem está com app_metadata.trocar_senha = true não lê nem grava dados até trocar a senha.
-- Cadastros com data.excluido = true não dão acesso.
create or replace function public.precisa_trocar_senha() returns boolean language sql stable set search_path = public as $$
  select coalesce(auth.jwt()->'app_metadata'->>'trocar_senha', 'false') = 'true';
$$;
create or replace function public.is_member() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'email', '') <> '' and not public.precisa_trocar_senha() and (
    public.is_admin() or exists (select 1 from docs where col = 'pessoas' and lower(data->>'email') = lower(auth.jwt()->>'email') and coalesce(data->>'excluido','false') <> 'true')
  );
$$;
create or replace function public.is_diretor() returns boolean language sql stable security definer set search_path = public as $$
  select not public.precisa_trocar_senha() and (public.is_admin() or exists (select 1 from docs where col = 'pessoas' and lower(data->>'email') = lower(coalesce(auth.jwt()->>'email', '')) and data->'papeis' ? 'diretoria' and coalesce(data->>'excluido','false') <> 'true'));
$$;
