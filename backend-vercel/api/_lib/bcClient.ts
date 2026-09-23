/**
 * Cliente para autenticarse contra Entra ID (client credentials flow)
 * y leer/escribir en los endpoints OData de Business Central.
 *
 * Las credenciales viven SOLO en las variables de entorno del proyecto
 * de Vercel (Project Settings → Environment Variables), nunca en el
 * frontend ni en el repositorio.
 */

interface TokenCache {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cachedToken: TokenCache | null = null;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.accessToken;
  }

  const tenantId = requireEnv('BC_TENANT_ID');
  const clientId = requireEnv('BC_CLIENT_ID');
  const clientSecret = requireEnv('BC_CLIENT_SECRET');

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://api.businesscentral.dynamics.com/.default',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`No se pudo obtener el token de Entra ID (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { accessToken: json.access_token, expiresAt: now + json.expires_in * 1000 };
  return cachedToken.accessToken;
}

async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
}

/** Descarga TODAS las páginas de un endpoint OData (sigue @odata.nextLink). */
export async function fetchODataEntities(entityUrl: string, query = ''): Promise<any[]> {
  const results: any[] = [];
  let url: string | undefined = query ? `${entityUrl}${query}` : entityUrl;

  while (url) {
    const res: Response = await authFetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Error consultando Business Central (${res.status}): ${text}`);
    }
    const json: any = await res.json();
    if (Array.isArray(json.value)) results.push(...json.value);
    url = json['@odata.nextLink'];
  }
  return results;
}

/** Crea una entidad nueva vía OData (POST). */
export async function createODataEntity(entityUrl: string, payload: Record<string, any>): Promise<any> {
  const res = await authFetch(entityUrl, { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) {
    const text = await res.text();
    const err: any = new Error(`Error creando el registro en Business Central (${res.status}): ${text}`);
    err.status = res.status;
    err.bcBody = text;
    throw err;
  }
  return res.json();
}

// El correlativo de un "No" (prefijo + número) debe tener EXACTAMENTE 4
// dígitos. Un código con el prefijo correcto pero 3 o 5 dígitos tras él
// está mal codificado (creado a mano, fuera del estándar) y se ignora por
// completo: no cuenta para el correlativo ni bloquea el hueco que ocupa.
const FOUR_DIGIT_SUFFIX = /^\d{4}$/;

/**
 * Devuelve los números (parte correlativa, ya convertida a entero) de todos
 * los artículos existentes con el prefijo dado, ignorando cualquier código
 * mal codificado (correlativo con más o menos de 4 dígitos).
 */
async function getUsedNumbersWithPrefix(itemsUrl: string, prefix: string): Promise<number[]> {
  const escapedPrefix = prefix.replace(/'/g, "''");
  // Traemos solo el campo No de todos los artículos con ese prefijo (todas
  // las páginas, vía fetchODataEntities) para poder detectar huecos.
  const query = `?$select=No&$filter=startswith(No,'${escapedPrefix}')`;
  const entities = await fetchODataEntities(itemsUrl, query);

  const numbers: number[] = [];
  for (const entity of entities) {
    const no = entity.No as string;
    const suffix = no.substring(prefix.length);
    if (FOUR_DIGIT_SUFFIX.test(suffix)) {
      numbers.push(parseInt(suffix, 10));
    }
  }
  return numbers;
}

/**
 * Calcula el siguiente número correlativo (prefijo + 4 dígitos) para un
 * prefijo dado, RELLENANDO HUECOS: si existen GCAB0001..GCAB0041 y luego
 * GCAB0043 (falta GCAB0042 porque se codificó mal en su día), el siguiente
 * alta con prefijo GCAB ocupa GCAB0042 en vez de continuar por GCAB0044.
 * Si no hay huecos, continúa con el siguiente número tras el máximo.
 */
export async function computeNextNo(itemsUrl: string, prefix: string): Promise<string> {
  const used = new Set(await getUsedNumbersWithPrefix(itemsUrl, prefix));
  let next = 1;
  while (used.has(next)) next++;
  return `${prefix}${String(next).padStart(4, '0')}`;
}
