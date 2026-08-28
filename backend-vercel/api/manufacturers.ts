import { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_lib/cors';
import { fetchODataEntities, requireEnv } from './_lib/bcClient';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const url = requireEnv('BC_MANUFACTURERS_ENTITY_URL');
    const entities = await fetchODataEntities(url);
    const manufacturers = entities.map((m: any) => ({
      code: m.Code,
      name: m.Name ?? m.Description ?? '',
    }));
    return res.status(200).json(manufacturers);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message ?? 'Error interno' });
  }
}
