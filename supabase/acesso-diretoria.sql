-- Sistema Alra · só a Diretoria muda e-mails de acesso e o papel Diretoria (rode uma vez no SQL Editor)
do $SISTEMA$
begin
  execute $A$create or replace function public.is_diretor() returns boolean language sql stable security definer set search_path = public as $f$
    select public.is_admin() or exists (select 1 from docs where col = 'pessoas' and lower(data->>'email') = lower(coalesce(auth.jwt()->>'email', '')) and data->'papeis' ? 'diretoria');
  $f$$A$;
  execute $B$create or replace function public.guard_pessoas() returns trigger language plpgsql security definer set search_path = public as $f$
  declare
    quem text := lower(coalesce(auth.jwt()->>'email', ''));
    novo text := lower(coalesce(new.data->>'email', ''));
    antigo text := case when tg_op = 'UPDATE' then lower(coalesce(old.data->>'email', '')) else '' end;
    dir_novo boolean := coalesce(new.data->'papeis' ? 'diretoria', false);
    dir_antigo boolean := case when tg_op = 'UPDATE' then coalesce(old.data->'papeis' ? 'diretoria', false) else false end;
  begin
    if quem = '' then return new; end if;  -- SQL Editor e servidor
    if (novo <> antigo or dir_novo <> dir_antigo) and not public.is_diretor() then
      raise exception 'Somente a Diretoria libera acessos e o papel Diretoria.';
    end if;
    if novo <> '' and novo <> antigo and novo not like '%@alramarketing.com.br' and not public.is_admin() then
      raise exception 'O acesso é liberado só para e-mails @alramarketing.com.br.';
    end if;
    return new;
  end $f$$B$;
  execute $C$drop trigger if exists guard_pessoas on public.docs$C$;
  execute $D$create trigger guard_pessoas before insert or update on public.docs for each row when (new.col = 'pessoas') execute function public.guard_pessoas()$D$;
end
$SISTEMA$;

-- Funções de segurança: só o necessário fica exposto
revoke execute on function public.guard_pessoas() from public, anon, authenticated;
revoke execute on function public.is_diretor() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_admin(), public.is_member() to authenticated;
