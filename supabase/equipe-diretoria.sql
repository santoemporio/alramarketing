-- Sistema Alra · equipe gerida só pela Diretoria
-- Diretoria: cria, edita e remove pessoas (e-mails só @alramarketing.com.br).
-- Demais: só alteram no próprio perfil a foto, o último acesso e a marcação de senha criada.
create or replace function public.guard_pessoas() returns trigger language plpgsql security definer set search_path = public as $f$
declare
  quem text := lower(coalesce(auth.jwt()->>'email', ''));
  livres text[] := array['foto', 'ultimoAcesso', 'senhaDefinida'];
  novo text;
begin
  if coalesce(new.col, old.col) <> 'pessoas' or quem = '' then return coalesce(new, old); end if;
  if public.is_diretor() then
    if tg_op <> 'DELETE' then
      novo := lower(coalesce(new.data->>'email', ''));
      if novo <> '' and novo not like '%@alramarketing.com.br' then
        raise exception 'O acesso é liberado só para e-mails @alramarketing.com.br.';
      end if;
    end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and lower(coalesce(old.data->>'email', '')) = quem and (new.data - livres) = (old.data - livres) then
    return new;
  end if;
  raise exception 'Somente a Diretoria cadastra pessoas e define cargos e papéis.';
end $f$;
drop trigger if exists guard_pessoas on public.docs;
create trigger guard_pessoas before insert or update or delete on public.docs for each row execute function public.guard_pessoas();
revoke execute on function public.guard_pessoas() from public, anon, authenticated;
