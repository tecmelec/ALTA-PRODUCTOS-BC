import { VercelRequest } from '@vercel/node';

/**
 * URL base a la que se encadenan las tandas.
 *
 * NO se usa el host de la petición: el cron de Vercel llama a la URL propia
 * del despliegue (alta-productos-xxxx-tecmelecs-projects.vercel.app), que
 * está protegida por "Vercel Authentication" (Deployment Protection) y
 * devuelve 401 a cualquier llamada sin login de Vercel. El dominio de
 * producción del proyecto no está protegido (es el que usa la app), así
 * que se usa ese. Vercel lo expone automáticamente en
 * VERCEL_PROJECT_PRODUCTION_URL.
 */
function chainBaseUrl(req: VercelRequest): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  return `${proto}://${req.headers.host}`;
}

/**
 * Dispara la siguiente tanda de la sincronización llamándose a sí mismo,
 * sin que nadie tenga que esperar con el navegador abierto. Se usa
 * únicamente desde el cron nocturno para completar catálogos grandes que
 * no caben en una sola invocación.
 */
export async function triggerNextChainLink(req: VercelRequest, nextSkip: number, full: boolean): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;

  const url = `${chainBaseUrl(req)}/api/sync-products`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-cron-secret': secret,
  };
  // Si en Vercel está activado "Protection Bypass for Automation", Vercel
  // crea esta variable sola y con esta cabecera la llamada salta la
  // protección aunque el dominio esté protegido.
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ skip: nextSkip, full, chain: true }),
    });
    if (!res.ok) {
      // Si la siguiente tanda falla, la sincronización completa no termina
      // y no se borran los artículos eliminados en BC: que quede en el log.
      const body = (await res.text()).slice(0, 300);
      console.error(`La tanda de sincronización desde ${nextSkip} falló (${url}): HTTP ${res.status} ${body}`);
    }
  } catch (err) {
    console.error(`No se pudo encadenar la siguiente tanda de sincronización (${url}):`, err);
  }
}
