import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Acceso a la app: usuarios del proyecto de Supabase "Portal Compras".
// Es un proyecto DISTINTO al de la réplica de productos (ese solo lo usa
// el backend). Valores inyectados en build time desde los secrets de
// GitHub (ver .github/workflows/deploy.yml).
const env = (import.meta as any).env ?? {};
const AUTH_URL: string = env.VITE_AUTH_SUPABASE_URL || '';
const AUTH_ANON_KEY: string = env.VITE_AUTH_SUPABASE_ANON_KEY || '';

export function isAuthConfigured(): boolean {
  return Boolean(AUTH_URL && AUTH_ANON_KEY);
}

export const authClient: SupabaseClient | null = isAuthConfigured()
  ? createClient(AUTH_URL, AUTH_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

/** Token de la sesión actual (se renueva solo si está a punto de caducar). */
export async function getAccessToken(): Promise<string | null> {
  if (!authClient) return null;
  const { data } = await authClient.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signOut(): Promise<void> {
  await authClient?.auth.signOut();
}
