import { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../_lib/cors';
import { getSupabase } from '../_lib/supabaseClient';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const supabase = getSupabase();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('units_of_measure').select('code').order('code');
      if (error) throw new Error(error.message);
      return res.status(200).json((data ?? []).map((r: any) => r.code));
    }

    if (req.method === 'POST') {
      const code = (req.body?.code as string | undefined)?.trim().toUpperCase();
      if (!code) return res.status(400).json({ error: 'Falta el código de la unidad' });

      const { error } = await supabase.from('units_of_measure').upsert({ code });
      if (error) throw new Error(error.message);
      return res.status(201).json({ code });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message ?? 'Error interno' });
  }
}
