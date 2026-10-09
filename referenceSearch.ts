import { api } from './api';
import { ExternalProduct, Product } from './types';

// Búsqueda de referencias de fabricante en el CATÁLOGO COMPLETO (réplica
// de Business Central en Supabase), no solo en los productos que la
// pestaña Productos tiene cargados en pantalla. La usan la Inspección de
// referencias y el Alta masiva.

export interface ReferenceMatch {
  no: string;
  description: string;
  /** true si la descripción contiene "REF. <referencia>" (formato de la app). */
  exact: boolean;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * "REF. X" seguido de fin de texto, espacio o puntuación de cierre. Así
 * "ABC1" no coincide con "ABC12" ni con "ABC1-B", que son otras referencias.
 */
export const refPattern = (ref: string) =>
  new RegExp(`REF\\.\\s*${escapeRegExp(ref)}(?=$|[\\s,;)])`, 'i');

/**
 * La referencia aparece en la descripción como palabra completa, aunque no
 * lleve delante "REF." (artículos antiguos o dados de alta a mano en BC).
 */
const looseRefPattern = (ref: string) =>
  new RegExp(`(^|[^A-Z0-9\\-/.])${escapeRegExp(ref)}(?=$|[^A-Z0-9\\-/])`, 'i');

function classify(
  ref: string,
  candidates: { no: string; description: string; manufacturerRef?: string }[],
  includeLoose: boolean,
): ReferenceMatch[] {
  const exactRe = refPattern(ref);
  const looseRe = looseRefPattern(ref);
  const byNo = new Map<string, ReferenceMatch>();

  for (const p of candidates) {
    const exact =
      exactRe.test(p.description) || (!!p.manufacturerRef && p.manufacturerRef.toUpperCase() === ref);
    const loose = !exact && includeLoose && looseRe.test(p.description);
    if (!exact && !loose) continue;
    const prev = byNo.get(p.no);
    if (!prev || (exact && !prev.exact)) byNo.set(p.no, { no: p.no, description: p.description, exact });
  }

  // Primero las coincidencias exactas ("REF. X").
  return [...byNo.values()].sort((a, b) => Number(b.exact) - Number(a.exact));
}

/**
 * Busca los artículos que tienen una referencia de fabricante.
 *  - Con backend: consulta el catálogo completo en Supabase.
 *  - Sin backend (modo local): busca en los productos guardados en el navegador.
 * En ambos casos añade la lista de productos BC importada a mano (pestaña
 * "Productos BC"), si existe.
 */
export async function findProductsByRef(
  rawRef: string,
  options: {
    apiConfigured: boolean;
    localProducts?: Product[];
    externalProducts?: ExternalProduct[];
    /** Incluir también apariciones de la referencia sin "REF." delante. */
    includeLoose?: boolean;
  },
): Promise<ReferenceMatch[]> {
  const ref = rawRef.trim().toUpperCase();
  if (!ref) return [];
  const includeLoose = options.includeLoose ?? false;

  let candidates: { no: string; description: string; manufacturerRef?: string }[] = [];
  if (options.apiConfigured) {
    // El buscador del backend exige que aparezcan todas las palabras, así
    // que basta con buscar la referencia; luego afinamos aquí.
    const search = ref.replace(/[%_"\\]/g, ' ');
    candidates = await api.getProducts({ search, limit: 1000 });
  } else {
    candidates = options.localProducts ?? [];
  }

  return classify(ref, [...candidates, ...(options.externalProducts ?? [])], includeLoose);
}

/**
 * Ejecuta `task` sobre cada elemento con como mucho `concurrency` tareas a
 * la vez, avisando del progreso.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let done = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await task(items[i]);
      done++;
      onProgress?.(done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
