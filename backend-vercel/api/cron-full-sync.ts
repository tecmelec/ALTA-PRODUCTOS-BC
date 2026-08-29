import { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { runSyncChunk } from './_lib/syncCore';
import { triggerNextChainLink } from './_lib/chain';

/**
 * Punto de entrada del Cron Job de Vercel (ver vercel.json → "crons").
 * Vercel invoca esta ruta automáticamente cada semana y añade la cabecera
 * `Authorization: Bearer <CRON_SECRET>` si la variable CRON_SECRET está
 * configurada — así verificamos que la llamada es legítima.
 *
 * Lanza una sincronización COMPLETA y se encadena a sí misma (vía
 * /api/sync-products con chain=true) hasta terminar todo el catálogo,
 * sin que nadie tenga que dejar el navegador abierto.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const result = await runSyncChunk(0, true);

    if (!result.done) {
      waitUntil(triggerNextChainLink(req, result.nextSkip, true));
    }

    return res.status(200).json({ started: true, ...result });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message ?? 'Error interno' });
  }
}
