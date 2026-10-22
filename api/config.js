// Entrega ao navegador o endereço do Supabase e a chave pública (anon). A chave anon é pública por design; o acesso é controlado pelas regras (RLS) do banco.
module.exports = (req, res) => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  res.setHeader("Cache-Control", "no-store");
  if (!url || !anonKey) return res.status(500).json({ error: "Supabase não configurado" });
  res.status(200).json({ url, anonKey });
};
