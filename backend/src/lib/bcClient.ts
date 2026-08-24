/**
 * Cliente para autenticarse contra Entra ID (client credentials flow)
 * y consultar los endpoints OData de Business Central.
 *
 * Las credenciales (Tenant ID, Client ID, Client Secret) viven SOLO
 * en la configuración del backend (Azure Function App Settings),
 * nunca en el frontend.
 */

interface TokenCache {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cachedToken: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.accessToken;
  }

  const tenantId = requireEnv("BC_TENANT_ID");
  const clientId = requireEnv("BC_CLIENT_ID");
  const clientSecret = requireEnv("BC_CLIENT_SECRET");

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://api.businesscentral.dynamics.com/.default",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`No se pudo obtener el token de Entra ID (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

/**
 * Descarga TODAS las páginas de un endpoint OData de BC (sigue @odata.nextLink).
 */
export async function fetchODataEntities(entityUrl: string): Promise<any[]> {
  const token = await getAccessToken();
  const results: any[] = [];
  let url: string | undefined = entityUrl;

  while (url) {
    const res: Response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Error consultando Business Central (${res.status}): ${text}`);
    }

    const json: any = await res.json();
    if (Array.isArray(json.value)) {
      results.push(...json.value);
    }
    url = json["@odata.nextLink"];
  }

  return results;
}
