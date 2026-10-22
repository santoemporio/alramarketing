// Backup semanal (Vercel Cron, domingo 21h47 de Brasília): exporta todo o banco para o bucket privado "backups".
const db = require("./_supa");
module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: "não autorizado" });
  try {
    const rows = await db.listAll(), day = new Date().toISOString().slice(0, 10), out = { geradoEm: new Date().toISOString(), colecoes: {} };
    rows.forEach(r => { (out.colecoes[r.col] = out.colecoes[r.col] || {})[r.id] = r.data; });
    const path = `backup-${day}.json`;
    await db.upload("backups", path, JSON.stringify(out), "application/json");
    const cont = Object.entries(out.colecoes).map(([k, v]) => ({ t: k, sub: `${Object.keys(v).length} documentos` }));
    await db.setDocs([{ col: "relatorios", id: `backup-${day}`, data: { tipo: "backup", data: day, unidade: "todas", titulo: "Backup semanal salvo", criadoEm: new Date().toISOString(), resumo: `Arquivo ${path} salvo no armazenamento privado do Supabase (bucket backups).`, kpis: [{ n: rows.length, l: "documentos salvos" }, { n: Object.keys(out.colecoes.pecas || {}).length, l: "pautas" }], secoes: [{ titulo: "Coleções", itens: cont }] } }]);
    res.status(200).json({ ok: true, path, docs: rows.length });
  } catch (e) { console.error(e); res.status(500).json({ error: String(e.message || e) }); }
};
