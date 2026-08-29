import { VercelRequest } from '@vercel/node';

/**
 * Dispara la siguiente tanda de la sincronización llamándose a sí mismo,
 * sin que nadie tenga que esperar con el navegador abierto. Se usa
 * únicamente desde el cron semanal para completar catálogos grandes que
 * no caben en una sola invocación de 10s.
 */
export async function triggerNextChainLink(req: VercelRequest, nextSkip: number, full: boolean): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;

  const host = req.headers.host;
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const url = `${proto}://${host}/api/sync-products`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
      body: JSON.stringify({ skip: nextSkip, full, chain: true }),
    });
  } catch (err) {
    console.error('No se pudo encadenar la siguiente tanda de sincronización:', err);
  }
}
