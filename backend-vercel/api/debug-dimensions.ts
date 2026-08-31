import { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_lib/cors';
import { fetchODataEntities, requireEnv } from './_lib/bcClient';

// Endpoint temporal de depuración: devuelve tal cual las dimensiones
// predeterminadas ya existentes en BC, para ver los nombres/valores reales
// de sus campos (en concreto, qué número usa Table_ID para "Item").
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const url = requireEnv('BC_DEFAULT_DIMENSIONS_ENTITY_URL');
    const top = Number(req.query.top) || 5;
    const entities = await fetchODataEntities(url, `?$top=${top}`);
    return res.status(200).json(entities);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message ?? 'Error interno' });
  }
}
