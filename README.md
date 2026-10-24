# Sistema Alra

Sistema de conteúdo da Alra Marketing: calendário, pautas, aprovação do cliente, publicações, captações, relatórios.

- **Site:** página única (`index.html`) servida pela Vercel.
- **Banco, login e arquivos:** Supabase (projeto `alra-marketing`).
- **Portal do cliente:** `/c/<token>` abre sem login e só mostra a aprovação daquele cliente (`api/portal.js`).
- **Backup semanal:** `api/cron-backup.js`, domingo 21h47 (Brasília), salva o banco no bucket privado `backups`.

## Colocar no ar (uma vez)

1. **Banco:** no Supabase, abra *SQL Editor*, cole o conteúdo de `supabase/schema.sql` e rode. Depois rode o arquivo de dados que o Claude enviou (não fica no repositório).
2. **Vercel:** *Add New → Project*, importe este repositório (framework: *Other*) e faça o deploy.
3. **Ligar o banco ao projeto:** em *Storage*, abra o banco `alra-marketing` e conecte ao projeto. As chaves `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` entram sozinhas. Faça um novo deploy.
4. **Backup:** em *Settings → Environment Variables*, crie `CRON_SECRET` com uma senha longa qualquer.
5. **Endereço do login:** no Supabase, *Authentication → URL Configuration*: em *Site URL* coloque o endereço do site na Vercel e adicione o mesmo em *Redirect URLs*.
6. **Login com Google (opcional, recomendado):** *Authentication → Sign In / Providers → Google*, com o Client ID e o Secret criados no Google Cloud da Alra. Até isso ficar pronto, a equipe entra pelo link enviado por e-mail.

## Quem entra

- Administradores iniciais ficam na tabela `admins` (ver `schema.sql`).
- Os demais entram quando a Diretoria/Head cadastra o e-mail da pessoa em **Equipe**. Vale Gmail ou e-mail da Alra.
- Clientes não precisam de conta: usam o link de aprovação gerado em **Clientes → Informações do cliente → Link de aprovação**.

## Reorganização (out/2026)
- Times derivados do papel: Diretoria → A, Head → B, demais → C (pode ser fixado em Configurações → Usuários, campo `time`). Clientes = Time D, só pelos links públicos.
- Menus: C = Início, Pauta da equipe, Kanban, Calendário, Aprovações, Captações, Clientes; B = + Publicações, Dashboards; A = + Configurações.
- Campos novos (opcionais, nunca renomeados): `pecas.dataProducao`, `captacoes.driveBruto`, `pessoas.time`.
- Modo demonstração sem banco: abra `/?demo=1`.
- Backup: Configurações → Segurança e backup → "Fazer backup agora" (bucket privado `backups`). Cópia do banco antes da reorganização: tabela `docs_backup_20261023`. Versão anterior do código: branch `v1-estavel`.
