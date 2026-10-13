import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Control de acceso: solo los usuarios con sesión iniciada en el proyecto
 * de Supabase "Portal Compras" pueden usar la API.
 *
 * El frontend envía el token de sesión del usuario en la cabecera
 * `Authorization: Bearer <token>`, y aquí se valida contra ese proyecto.
 *
 * Variables de entorno (Vercel):
 *   AUTH_SUPABASE_URL       URL del proyecto Portal Compras
 *   AUTH_SUPABASE_ANON_KEY  clave pública (anon / publishable) de ese proyecto
 *
 * OJO: es un proyecto de Supabase DISTINTO al de la réplica de productos
 * (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
 */

let authClient: SupabaseClient | null = null;

function getAuthClient(): SupabaseClient {
  if (authClient) return authClient;
  const url = process.env.AUTH_SUPABASE_URL;
  const key = process.env.AUTH_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Falta configurar AUTH_SUPABASE_URL y AUTH_SUPABASE_ANON_KEY en Vercel');
  }
  authClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return authClient;
}

// Caché breve de tokens ya validados, para no consultar a Supabase en cada
// petición (la app hace varias llamadas seguidas al cargar). Vive solo
// mientras la función de Vercel está "caliente".
const CACHE_MS = 60_000;
const validated = new Map<string, number>();

function cacheHit(token: string): boolean {
  const until = validated.get(token);
  if (!until) return false;
  if (until < Date.now()) {
    validated.delete(token);
    return false;
  }
  return true;
}

function remember(token: string) {
  if (validated.size > 500) validated.clear();
  validated.set(token, Date.now() + CACHE_MS);
}

/**
 * Comprueba la sesión. Devuelve true si el usuario está autenticado; si no,
 * responde 401 (o 500 si falta configuración) y devuelve false, y el
 * handler debe cortar ahí.
 */
export async function requireAuth(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Debes iniciar sesión para usar la aplicación' });
    return false;
  }
  if (cacheHit(token)) return true;

  try {
    const { data, error } = await getAuthClient().auth.getUser(token);
    if (error || !data?.user) {
      res.status(401).json({ error: 'La sesión ha caducado o no es válida. Vuelve a iniciar sesión.' });
      return false;
    }
    remember(token);
    return true;
  } catch (err: any) {
    console.error('Error validando la sesión:', err);
    res.status(500).json({ error: err?.message ?? 'No se pudo validar la sesión' });
    return false;
  }
}
