// Acessos da equipe (Supabase Auth), sempre pelo servidor com a chave de serviço.
//  - liberar / redefinir (Diretoria): cria o login da pessoa ou volta a senha para a senha padrão.
//    A pessoa fica marcada para trocar a senha no primeiro acesso (app_metadata.trocar_senha).
//  - excluir (Diretoria): apaga o login. O cadastro e as demandas continuam no sistema, marcados como EXCLUÍDO.
//  - trocar-email (Diretoria): muda o e-mail de login.
//  - trocar-senha (a própria pessoa): grava a nova senha e libera o acesso.
const db = require("./_supa");
const DOMINIO = "@alramarketing.com.br";
const PADRAO = process.env.SENHA_PADRAO || "senha0123";
const H = () => ({ apikey: db.KEY, Authorization: `Bearer ${db.KEY}`, "Content-Type": "application/json" });
const low = s => String(s || "").trim().toLowerCase();

async function findUser(email) {
  for (let page = 1; page < 50; page++) {
    const r = await fetch(`${db.URL_}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: H() });
    if (!r.ok) throw new Error("auth list " + r.status);
    const j = await r.json(), users = j.users || [];
    const u = users.find(x => low(x.email) === email);
    if (u || users.length < 200) return u || null;
  }
  return null;
}
async function updUser(id, body) {
  const r = await fetch(`${db.URL_}/auth/v1/admin/users/${id}`, { method: "PUT", headers: H(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error("auth update " + r.status + " " + (await r.text()));
  return r.json();
}
async function marcaPessoa(pessoa, acesso) {
  const data = Object.assign({}, pessoa.data, { acesso: Object.assign({}, pessoa.data.acesso || {}, acesso) });
  await db.setDocs([{ col: "pessoas", id: pessoa.id, data }]);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
  if (!db.ready()) return res.status(500).json({ error: "Sistema não configurado." });
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const ur = token ? await fetch(`${db.URL_}/auth/v1/user`, { headers: { apikey: db.KEY, Authorization: `Bearer ${token}` } }) : null;
    if (!ur || !ur.ok) return res.status(401).json({ error: "Entre de novo no sistema." });
    const caller = await ur.json(), me = low(caller.email);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const acao = String(body.acao || "");
    const pessoas = await db.listCol("pessoas");
    const minha = pessoas.find(p => low(p.data.email) === me && !p.data.excluido);

    if (acao === "trocar-senha") {
      const senha = String(body.senha || "");
      if (senha.length < 8) return res.status(400).json({ error: "Use pelo menos 8 caracteres." });
      if (senha === PADRAO) return res.status(400).json({ error: "Escolha uma senha diferente da senha padrão." });
      await updUser(caller.id, { password: senha, app_metadata: { trocar_senha: false } });
      if (minha) await marcaPessoa(minha, { padrao: false, senhaTrocadaEm: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }

    const admins = (await db.q(`admins?email=eq.${encodeURIComponent(me)}&select=email`)) || [];
    const isDir = !(caller.app_metadata || {}).trocar_senha && (admins.length > 0 || (!!minha && (minha.data.papeis || []).includes("diretoria")));
    if (!isDir) return res.status(403).json({ error: "Só a Diretoria gerencia os acessos da equipe." });

    const email = low(body.email);
    if (acao === "liberar" || acao === "redefinir") {
      if (!email.endsWith(DOMINIO)) return res.status(400).json({ error: `O acesso é liberado só para e-mails ${DOMINIO}.` });
      if (email === me) return res.status(400).json({ error: "Para mudar a sua própria senha, use Meu perfil." });
      const alvo = pessoas.find(p => low(p.data.email) === email && !p.data.excluido);
      if (!alvo) return res.status(400).json({ error: "Salve a pessoa com esse e-mail em Equipe antes de liberar o acesso." });
      const u = await findUser(email);
      if (u) await updUser(u.id, { password: PADRAO, email_confirm: true, ban_duration: "none", app_metadata: { trocar_senha: true } });
      else {
        const r = await fetch(`${db.URL_}/auth/v1/admin/users`, { method: "POST", headers: H(), body: JSON.stringify({ email, password: PADRAO, email_confirm: true, app_metadata: { trocar_senha: true } }) });
        if (!r.ok) { console.error(r.status, await r.text()); return res.status(502).json({ error: "Não foi possível criar o login agora." }); }
      }
      await marcaPessoa(alvo, { padrao: true, liberadoEm: new Date().toISOString(), liberadoPor: me });
      return res.status(200).json({ ok: true, email, senha: PADRAO });
    }
    if (acao === "excluir") {
      if (email === me) return res.status(400).json({ error: "Você não pode excluir o seu próprio cadastro." });
      const u = email ? await findUser(email) : null;
      if (u) { const r = await fetch(`${db.URL_}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: H() }); if (!r.ok && r.status !== 404) throw new Error("auth delete " + r.status); }
      return res.status(200).json({ ok: true });
    }
    if (acao === "trocar-email") {
      const de = low(body.de);
      if (!email.endsWith(DOMINIO)) return res.status(400).json({ error: `Use um e-mail ${DOMINIO}.` });
      const u = de ? await findUser(de) : null;
      if (!u) return res.status(200).json({ ok: true, semLogin: true });
      if (await findUser(email)) return res.status(400).json({ error: "Já existe um login com esse e-mail." });
      await updUser(u.id, { email, email_confirm: true });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Ação desconhecida." });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Erro ao gerenciar o acesso." });
  }
};
