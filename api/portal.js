// Portal de aprovação do cliente: acesso sem login, por link com token.
// Só lê e altera peças do próprio cliente que estão com ele (status "cliente").
const db = require("./_supa");

const CLIENT_ST = ["cliente", "ajuste", "aprovado", "publicado"];
const TEXT = ["artigo", "newsletter", "blog"];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const now = () => new Date().toISOString();
const titleOf = p => (p.briefing || {}).headline || (p.briefing || {}).ideia || "Pauta";
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, m => (m === "\n" ? "\n" : " ")).trim().slice(0, n);

async function clientByToken(t) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(t || ""))) return null;
  const r = await db.listCol("clientes", `&data->>portalToken=eq.${encodeURIComponent(t)}`);
  return r[0] ? { id: r[0].id, ...r[0].data } : null;
}
function sanitize(id, p) {
  const b = p.briefing || {};
  return {
    id, clienteId: p.clienteId, data: p.data, tipo: p.tipo, redes: p.redes || [], status: p.status,
    midias: (p.midias || []).filter(m => m.kind === "asset").map(m => ({ kind: "asset", id: m.id, video: !!m.video })),
    briefing: { headline: b.headline || "", sub: b.sub || "", legenda: b.legenda || "", corpo: b.corpo || "", card: !!b.card, formatos: b.formatos || [] },
    hist: (p.hist || []).filter(h => h.acao === "ajuste").map(h => ({ acao: "ajuste", texto: h.texto || "", tipo: h.tipo || "", em: h.em }))
  };
}
const notif = (para, texto, p, c) => ({ col: "notifs", id: uid(), data: { para, de: "cliente", texto, pecaId: p ? p.id : null, clienteId: c.id, em: now(), lida: false } });

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!db.ready()) return res.status(500).json({ error: "Sistema não configurado." });
  try {
    if (req.method === "GET") {
      const c = await clientByToken(req.query.t);
      if (!c) return res.status(404).json({ error: "Link inválido." });
      const cfg = (await db.getDoc("cfg", "main")) || {};
      const lo = new Date(Date.now() - 150 * 864e5).toISOString().slice(0, 10), hi = new Date(Date.now() + 150 * 864e5).toISOString().slice(0, 10);
      const rows = await db.listCol("pecas", `&data->>clienteId=eq.${encodeURIComponent(c.id)}`);
      const pecas = rows.filter(r => r.data && CLIENT_ST.includes(r.data.status) && r.data.tipo !== "tarefa" && r.data.tipo !== "relatorio" && r.data.data >= lo && r.data.data <= hi).map(r => sanitize(r.id, r.data));
      return res.status(200).json({ rede: cfg.rede || "Alra", storageUrl: db.URL_, cliente: { id: c.id, nome: c.nome, cor: c.cor, aprovacao: c.aprovacao, contato: { nome: (c.contato || {}).nome || "" } }, pecas });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const c = await clientByToken(body.t);
    if (!c) return res.status(404).json({ error: "Este link não é mais válido. Peça o link atualizado à Alra." });
    const nome = clean(body.nome, 80);
    if (!nome) return res.status(400).json({ error: "Escreva seu nome antes de responder." });
    const sq = c.squad || {}, writes = [];
    const load = async id => { const d = await db.getDoc("pecas", String(id || "")); return d && d.clienteId === c.id ? { id: String(id), ...d } : null; };
    const put = p => { const { id, ...data } = p; writes.push({ col: "pecas", id, data }); };

    if (body.action === "approve" || body.action === "adjust") {
      const p = await load(body.pecaId);
      if (!p) return res.status(404).json({ error: "Peça não encontrada." });
      if (p.status !== "cliente") return res.status(409).json({ error: "Esta peça já foi respondida." });
      p.hist = p.hist || [];
      if (body.action === "approve") {
        p.status = "aprovado"; p.hist.push({ acao: "aprovou", em: now(), por: "cliente", nome });
        put(p); { const quem = p.tipo === "anuncio" ? ((p.resp || {}).traf || (sq.trafego || [])[0] || (sq.social || [])[0]) : ((sq.social || [])[0] || (p.resp || {}).plan); if (quem) writes.push(notif(quem, p.tipo === "anuncio" ? `Criativo aprovado: configure a campanha ${titleOf(p)} (${c.nome})` : `Aprovada, pronta para publicar: ${titleOf(p)} (${c.nome})`, p, c)); }
      } else {
        const texto = clean(body.texto, 4000), tipo = ["arte", "legenda", "ambos", "texto"].includes(body.tipo) ? body.tipo : "arte";
        if (!texto) return res.status(400).json({ error: "Conte o que precisa mudar." });
        const needsArt = p.tipo !== "tarefa" && (!TEXT.includes(p.tipo) || !!(p.briefing || {}).card);
        p.status = "ajuste"; p.ajusteCom = (!needsArt || tipo === "legenda" || tipo === "texto") ? "planejamento" : "criacao";
        p.hist.push({ acao: "ajuste", em: now(), por: "cliente", nome, texto, tipo });
        put(p); { const quem = p.ajusteCom === "planejamento" ? (p.resp || {}).plan : ((p.resp || {}).prod || (p.resp || {}).plan); if (quem) writes.push(notif(quem, `Ajuste pedido pelo cliente: ${titleOf(p)} (${c.nome})`, p, c)); }
      }
      await db.setDocs(writes);
      return res.status(200).json({ ok: true });
    }

    if (body.action === "approveAll") {
      const dec = ["total", "parcial", "nenhum"].includes(body.dec) ? body.dec : "total";
      const texto = clean(body.texto, 4000);
      if (dec !== "total" && !texto) return res.status(400).json({ error: "Conte para a equipe o que não funcionou no planejamento." });
      const ids = Array.isArray(body.ids) ? body.ids.slice(0, 300) : [];
      let n = 0;
      if (dec === "total") {
        for (const id of ids) {
          const p = await load(id);
          if (!p || p.status !== "cliente") continue;
          p.status = "aprovado"; p.hist = p.hist || []; p.hist.push({ acao: "aprovou_tudo", em: now(), por: "cliente", nome, ...(texto ? { texto } : {}) });
          put(p); n++;
        }
        if (n) (sq.social || []).slice(0, 1).forEach(id => writes.push(notif(id, `${c.nome} aprovou o planejamento: ${n} ${n === 1 ? "peça pronta" : "peças prontas"} para publicar`, null, c)));
      } else (sq.planejamento || []).forEach(id => writes.push(notif(id, `${c.nome} comentou o planejamento: ${texto.slice(0, 80)}`, null, c)));
      writes.push({ col: "feedbacks", id: uid(), data: { clienteId: c.id, k: clean(body.k, 20), periodo: clean(body.periodo, 60), decisao: dec, texto, nome, em: now() } });
      await db.setDocs(writes);
      return res.status(200).json({ ok: true, n });
    }
    return res.status(400).json({ error: "Ação inválida." });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Não foi possível registrar agora. Tente de novo em instantes." });
  }
};
