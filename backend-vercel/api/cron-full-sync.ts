import { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { runSyncChunk, CRON_TIME_BUDGET_MS } from './_lib/syncCore';
import { triggerNextChainLink } from './_lib/chain';

/**
 * Punto de entrada del Cron Job de Vercel (ver vercel.json → "crons").
 * Vercel lo invoca TODOS LOS DÍAS a las 03:00 UTC (05:00 en horario de
 * verano de Madrid, 04:00 en invierno) con la cabecera
 * `Authorization: Bearer <CRON_SECRET>`.
 *
 * Lanza una sincronización COMPLETA: vuelve a descargar todo el catálogo
 * y, al terminar, elimina de la réplica los artículos que ya no existen en
 * Business Central (borrados o renumerados). Es lo mismo que el botón
 * "forzar completa" de la app.
 *
 * Cada invocación trabaja ~22 s; si el catálogo no cabe, se encadena a sí
 * misma (vía /api/sync-products con chain=true) hasta terminar.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Sin secreto no se puede verificar la llamada ni encadenar tandas, y
    // la sincronización se quedaría a medias sin borrar nada.
    console.error('CRON_SECRET no está configurado en Vercel: la sincronización nocturna no puede ejecutarse.');
    return res.status(500).json({ error: 'Falta configurar CRON_SECRET en Vercel' });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const result = await runSyncChunk(0, true, CRON_TIME_BUDGET_MS);
    console.log(`Cron: primera tanda de sincronización completa, ${result.syncedThisRun} artículos, done=${result.done}`);

    if (!result.done) {
      waitUntil(triggerNextChainLink(req, result.nextSkip, true));
    }

    return res.status(200).json({ started: true, ...result });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message ?? 'Error interno' });
  }
}
