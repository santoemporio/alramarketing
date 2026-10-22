// Entrega ao navegador o endereço do Supabase e a chave pública (anon). A chave anon é pública por design; o acesso é controlado pelas regras (RLS) do banco.
const { pick } = require("./_supa");
module.exports = (req, res) => {
  const url = pick("SUPABASE_URL");
  const anonKey = pick("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY");
  res.setHeader("Cache-Control", "no-store");
  if (!url || !anonKey) return res.status(500).json({ error: "Supabase não configurado", achei: Object.keys(process.env).filter(k => /SUPABASE/.test(k)) });
  res.status(200).json({ url, anonKey });
};
