// Limpeza diária das imagens: mantém no armazenamento só as imagens da última semana,
// para o Supabase ficar dentro do plano gratuito (1 GB de armazenamento, 5 GB de tráfego).
// Não toca em fotos de perfil, logos, anexos, comprovantes nem em nenhum arquivo que não seja imagem.
// As pautas continuam iguais: o link do Drive e todos os dados ficam; a tela mostra um aviso no lugar da imagem.
// Roda pela Vercel Cron (Bearer CRON_SECRET).
const db = require("./_supa");
const DIAS = 7;
const BUCKET = "arquivos";
const H = () => ({ apikey: db.KEY, Authorization: `Bearer ${db.KEY}`, "Content-Type": "application/json" });
async function listar(prefix) {
  let out = [], offset = 0;
  for (;;) {
    const r = await fetch(`${db.URL_}/storage/v1/object/list/${BUCKET}`, { method: "POST", headers: H(), body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }) });
    if (!r.ok) throw new Error(`list ${r.status}: ${await r.text()}`);
    const page = await r.json();
    out = out.concat(page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  return out;
}
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!db.ready()) return res.status(500).json({ error: "Sistema não configurado." });
  const tok = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || tok !== process.env.CRON_SECRET) return res.status(401).json({ error: "Não autorizado." });
  try {
    const corte = Date.now() - DIAS * 864e5;
    // pastas do bucket (uma por mês: 2026-11, 2026-12...)
    const raiz = await listar("");
    const pastas = raiz.filter(o => !o.id && o.name).map(o => o.name);
    let arquivos = [];
    for (const p of pastas) arquivos = arquivos.concat((await listar(p)).filter(o => o.id).map(o => ({ ...o, name: `${p}/${o.name}` })));
    // arquivos usados fora das pautas (fotos de perfil, logos, materiais, acessos, comprovantes) nunca saem
    const rows = await db.listAll();
    const outros = JSON.stringify(rows.filter(r => !["pecas", "arquivo", "notifs", "relatorios"].includes(r.col)).map(r => r.data));
    const sair = arquivos.filter(o => new Date(o.created_at).getTime() < corte && String((o.metadata || {}).mimetype || "").startsWith("image/") && !outros.includes(o.name)).map(o => o.name);
    let removidos = 0;
    for (let i = 0; i < sair.length; i += 100) {
      const r = await fetch(`${db.URL_}/storage/v1/object/${BUCKET}`, { method: "DELETE", headers: H(), body: JSON.stringify({ prefixes: sair.slice(i, i + 100) }) });
      if (!r.ok) throw new Error(`delete ${r.status}: ${await r.text()}`);
      removidos += ((await r.json()) || []).length;
    }
    res.status(200).json({ ok: true, analisados: arquivos.length, removidos });
  } catch (e) { console.error(e); res.status(500).json({ error: "Não foi possível fazer a limpeza agora." }); }
};
