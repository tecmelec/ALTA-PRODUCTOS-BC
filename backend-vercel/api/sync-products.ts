import { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { applyCors } from './_lib/cors';
import { runSyncChunk } from './_lib/syncCore';
import { triggerNextChainLink } from './_lib/chain';

/**
 * Sincroniza Business Central → Supabase.
 *
 * Por defecto es INCREMENTAL: solo trae artículos modificados desde la
 * última sincronización, lo que la hace mucho más rápida en el día a día.
 * Pasando `full: true` se trae el catálogo completo (útil la primera vez,
 * o para corregir inconsistencias, incluyendo borrados/renumeraciones).
 *
 * Es "resumible": si no da tiempo a terminar en una invocación, devuelve
 * `done: false` y un `nextSkip`. La app llama de nuevo con ese valor.
 *
 * `chain: true` es de uso interno (solo lo usa el cron semanal para
 * encadenar automáticamente varias invocaciones sin intervención manual);
 * requiere la cabecera `x-cron-secret` correcta.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const isChainCall = Boolean(req.body?.chain);
  if (isChainCall) {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers['x-cron-secret'] !== secret) {
      return res.status(401).json({ error: 'No autorizado' });
    }
  }

  const full = Boolean(req.body?.full);
  const skip = Number(req.body?.skip) || 0;

  try {
    const result = await runSyncChunk(skip, full);

    // Si esta llamada viene del cron y aún queda trabajo, encadenamos
    // automáticamente la siguiente tanda en segundo plano.
    if (isChainCall && !result.done) {
      waitUntil(triggerNextChainLink(req, result.nextSkip, full));
    }

    return res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message ?? 'Error interno' });
  }
}
