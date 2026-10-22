// Diretoria libera o acesso de uma pessoa da equipe (e-mail @alramarketing.com.br).
// Gera um link de acesso para copiar ou envia o link por e-mail.
const db = require("./_supa");
const DOMINIO = "@alramarketing.com.br";
const authH = () => ({ apikey: db.KEY, Authorization: `Bearer ${db.KEY}`, "Content-Type": "application/json" });

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
  if (!db.ready()) return res.status(500).json({ error: "Sistema não configurado." });
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const u = await fetch(`${db.URL_}/auth/v1/user`, { headers: { apikey: db.KEY, Authorization: `Bearer ${token}` } });
    if (!token || !u.ok) return res.status(401).json({ error: "Entre de novo no sistema." });
    const me = String((await u.json()).email || "").toLowerCase();
    const admins = (await db.q(`admins?email=eq.${encodeURIComponent(me)}&select=email`)) || [];
    const pessoas = await db.listCol("pessoas");
    const isDir = admins.length > 0 || pessoas.some(p => String(p.data.email || "").toLowerCase() === me && (p.data.papeis || []).includes("diretoria"));
    if (!isDir) return res.status(403).json({ error: "Só a Diretoria pode liberar acessos." });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const email = String(body.email || "").trim().toLowerCase();
    if (!email.endsWith(DOMINIO)) return res.status(400).json({ error: `O acesso é liberado só para e-mails ${DOMINIO}.` });
    if (!pessoas.some(p => String(p.data.email || "").toLowerCase() === email)) return res.status(400).json({ error: "Cadastre esse e-mail na pessoa (Equipe → Editar) antes de liberar." });
    const redirect = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;

    // garante que o usuário existe (confirmado); ignora "já existe"
    await fetch(`${db.URL_}/auth/v1/admin/users`, { method: "POST", headers: authH(), body: JSON.stringify({ email, email_confirm: true }) });

    if (body.send) {
      // e-mail "redefinir senha" do Supabase: a pessoa abre, cria a senha e entra
      const r = await fetch(`${db.URL_}/auth/v1/recover?redirect_to=${encodeURIComponent(redirect)}`, { method: "POST", headers: authH(), body: JSON.stringify({ email }) });
      if (r.status === 429) return res.status(429).json({ error: "O limite de e-mails por hora do Supabase foi atingido. Use “Copiar link de convite” e mande pelo WhatsApp." });
      if (!r.ok) return res.status(502).json({ error: "Não foi possível enviar o e-mail agora. Use “Copiar link de convite”." });
      return res.status(200).json({ ok: true, sent: true });
    }
    const g = await fetch(`${db.URL_}/auth/v1/admin/generate_link`, { method: "POST", headers: authH(), body: JSON.stringify({ type: "recovery", email, redirect_to: redirect }) });
    const j = await g.json().catch(() => ({}));
    const link = j.action_link || (j.properties || {}).action_link;
    if (!g.ok || !link) { console.error(g.status, j); return res.status(502).json({ error: "Não foi possível gerar o link agora." }); }
    return res.status(200).json({ ok: true, link });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Erro ao liberar o acesso." });
  }
};
