// Backup do banco inteiro para o bucket privado "backups".
// Roda pela Vercel Cron (Bearer CRON_SECRET) ou pelo botão "Fazer backup agora" da Diretoria (token de login).
const db = require("./_supa");
async function autorizado(req) {
  const tok = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!tok) return false;
  if (process.env.CRON_SECRET && tok === process.env.CRON_SECRET) return "cron";
  const u = await fetch(`${db.URL_}/auth/v1/user`, { headers: { apikey: db.KEY, Authorization: `Bearer ${tok}` } });
  if (!u.ok) return false;
  const me = await u.json(), email = String(me.email || "").toLowerCase();
  if ((me.app_metadata || {}).trocar_senha) return false;
  const admins = (await db.q(`admins?email=eq.${encodeURIComponent(email)}&select=email`)) || [];
  if (admins.length) return "diretoria";
  const pessoas = await db.listCol("pessoas");
  return pessoas.some(p => String(p.data.email || "").toLowerCase() === email && !p.data.excluido && (p.data.papeis || []).includes("diretoria")) ? "diretoria" : false;
}
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!db.ready()) return res.status(500).json({ error: "Sistema não configurado." });
  try {
    const quem = await autorizado(req);
    if (!quem) return res.status(401).json({ error: "Só a Diretoria pode fazer backup." });
    const rows = await db.listAll(), now = new Date(), day = now.toISOString().slice(0, 10), stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const out = { geradoEm: now.toISOString(), colecoes: {} };
    rows.forEach(r => { (out.colecoes[r.col] = out.colecoes[r.col] || {})[r.id] = r.data; });
    const path = `backup-${stamp}.json`;
    await db.upload("backups", path, JSON.stringify(out), "application/json");
    const cont = Object.entries(out.colecoes).map(([k, v]) => ({ t: k, sub: `${Object.keys(v).length} documentos` }));
    await db.setDocs([{ col: "relatorios", id: `backup-${stamp}`, data: { tipo: "backup", data: day, unidade: "todas", titulo: quem === "cron" ? "Backup semanal salvo" : "Backup feito pela Diretoria", criadoEm: now.toISOString(), resumo: `Arquivo ${path} salvo no armazenamento privado do Supabase (bucket backups).`, kpis: [{ n: rows.length, l: "documentos salvos" }, { n: Object.keys(out.colecoes.pecas || {}).length, l: "pautas" }], secoes: [{ titulo: "Coleções", itens: cont }] } }]);
    res.status(200).json({ ok: true, path, docs: rows.length });
  } catch (e) { console.error(e); res.status(500).json({ error: "Não foi possível fazer o backup agora." }); }
};
