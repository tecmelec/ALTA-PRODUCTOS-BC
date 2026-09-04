import { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../_lib/cors';
import { getSupabase } from '../_lib/supabaseClient';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Método no permitido' });

  const code = req.query.code as string;
  if (!code) return res.status(400).json({ error: 'Falta el código de la unidad' });

  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('units_of_measure').delete().eq('code', code);
    if (error) throw new Error(error.message);
    return res.status(200).json({ deleted: code });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message ?? 'Error interno' });
  }
}
