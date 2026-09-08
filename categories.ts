import { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_lib/cors';
import { fetchODataEntities, requireEnv } from './_lib/bcClient';

// Códigos de categoría de gastos generales / contables que Business Central
// expone como "Item Category" pero que no son categorías de producto de
// cara al usuario, así que se ocultan aquí para que nunca lleguen al front.
const HIDDEN_CATEGORY_CODES = new Set([
  '1GG',
  '62000002',
  '62100001',
  '62100002',
  '62100003',
  '62100006',
  '62100008',
  '62200002',
  '62200004',
  '62200006',
  '62200007',
  '62300001',
  '62300003',
  '62300005',
  '62300007',
  '62300008',
  '62700001',
  '62700002',
  '62800001',
  '62800003',
  '62900002',
  '62900003',
  '62900004',
  '62900005',
  '62900006',
  '62900007',
  '62900009',
  '62900010',
  '62900011',
  '62900012',
  '62900013',
  '62900014',
  '62900015',
  '62900016',
  '62000000',
  '62000001',
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const url = requireEnv('BC_ITEM_CATEGORIES_ENTITY_URL');
    const entities = await fetchODataEntities(url);
    const categories = entities
      .map((c: any) => ({
        code: c.Code,
        description: c.Description ?? '',
      }))
      .filter((c: { code: string }) => !HIDDEN_CATEGORY_CODES.has(c.code));
    return res.status(200).json(categories);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message ?? 'Error interno' });
  }
}

