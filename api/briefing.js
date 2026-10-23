// Onboarding do cliente: o cliente responde o checklist por link, sem login.
// Só lê e grava as respostas do onboarding (c.orientacoes) do cliente dono do link.
const db = require("./_supa");
const KEYS = ["objetivo","metas","sobre","mvv","vistoHoje","vistoDesejo","tom","naofazer","servicos","foco","diferenciais","objecoes","aquisicao","publico","concorrentes","inspiracoes","parceiros","fontes","testado","datas","extra"];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const now = () => new Date().toISOString();
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").slice(0, n);

async function clientByToken(t) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(t || ""))) return null;
  const r = await db.listCol("clientes", `&data->>briefingToken=eq.${encodeURIComponent(t)}`);
  return r[0] ? { id: r[0].id, data: r[0].data } : null;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!db.ready()) return res.status(500).json({ error: "Sistema não configurado." });
  try {
    if (req.method === "GET") {
      const c = await clientByToken(req.query.t);
      if (!c) return res.status(404).json({ error: "Link inválido." });
      const cfg = (await db.getDoc("cfg", "main")) || {}, o = c.data.orientacoes || {};
      const respostas = Object.fromEntries(KEYS.filter(k => o[k]).map(k => [k, String(o[k])]));
      return res.status(200).json({ rede: cfg.rede || "Alra", cliente: { nome: c.data.nome, cor: c.data.cor }, respostas, enviadoEm: (c.data.onboarding || {}).enviadoEm || null });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const c = await clientByToken(body.t);
    if (!c) return res.status(404).json({ error: "Este link não é mais válido. Peça o link atualizado à Alra." });
    const nome = clean(body.nome, 80).trim();
    if (!nome) return res.status(400).json({ error: "Escreva seu nome no topo antes de responder." });
    const r = body.respostas && typeof body.respostas === "object" ? body.respostas : {};
    const fresh = (await db.getDoc("clientes", c.id)) || c.data;
    const o = Object.assign({}, fresh.orientacoes || {});
    KEYS.forEach(k => { if (Object.prototype.hasOwnProperty.call(r, k)) o[k] = clean(r[k], 8000); });
    const ob = Object.assign({}, fresh.onboarding || {}, { cliente: { nome, atualizadoEm: now() } });
    if (body.concluir) ob.enviadoEm = now();
    const writes = [{ col: "clientes", id: c.id, data: Object.assign({}, fresh, { orientacoes: o, onboarding: ob }) }];
    if (body.concluir) {
      const sq = fresh.squad || {};
      [...new Set([...(sq.planejamento || []), ...(sq.atendimento || [])])].forEach(id => writes.push({ col: "notifs", id: uid(), data: { para: id, de: "cliente", texto: `Onboarding respondido por ${nome} (${fresh.nome}). Veja em Orientações.`, clienteId: c.id, em: now(), lida: false } }));
    }
    await db.setDocs(writes);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Não foi possível salvar agora." });
  }
};
