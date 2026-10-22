// Acesso ao Supabase pelo servidor (chave de serviço). Nunca é enviado ao navegador.
// Acha as chaves do Supabase mesmo se a Vercel tiver criado com prefixo (ex.: STORAGE_SUPABASE_URL)
const pick = (...ends) => { for (const e of ends) { if (process.env[e]) return process.env[e]; const k = Object.keys(process.env).find(n => n.endsWith(e) && process.env[n]); if (k) return process.env[k]; } return undefined; };
const URL_ = pick("SUPABASE_URL");
const KEY = pick("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
const H = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });
async function q(path, opts = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...opts, headers: { ...H(), ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
const enc = encodeURIComponent;
module.exports = {
  URL_, KEY, pick,
  ready: () => !!(URL_ && KEY),
  getDoc: async (col, id) => { const r = await q(`docs?col=eq.${enc(col)}&id=eq.${enc(id)}&select=id,data`); return r && r[0] ? r[0].data : null; },
  listCol: async (col, extra = "") => (await q(`docs?col=eq.${enc(col)}&select=id,data${extra}`)) || [],
  listAll: async () => { let out = [], from = 0; for (;;) { const r = await q(`docs?select=col,id,data,updated_at&order=col,id`, { headers: { Range: `${from}-${from + 999}` } }); out = out.concat(r || []); if (!r || r.length < 1000) break; from += 1000; } return out; },
  setDocs: async rows => q(`docs?on_conflict=col,id`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.map(r => ({ ...r, updated_at: new Date().toISOString() }))) }),
  upload: async (bucket, path, body, type) => { const r = await fetch(`${URL_}/storage/v1/object/${bucket}/${path}`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": type, "x-upsert": "true" }, body }); if (!r.ok) throw new Error(`storage ${r.status}: ${await r.text()}`); }
};
