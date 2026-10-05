import { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { applyCors } from './_lib/cors';
import { requireEnv } from './_lib/bcClient';

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

async function tavilySearch(
  query: string,
  opts?: { includeDomains?: string[]; searchDepth?: 'basic' | 'advanced'; maxResults?: number }
): Promise<TavilyResult[]> {
  const apiKey = requireEnv('TAVILY_API_KEY');
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      search_depth: opts?.searchDepth ?? 'basic',
      max_results: opts?.maxResults ?? 3,
      include_domains: opts?.includeDomains ?? [],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error consultando Tavily (${res.status}): ${text}`);
  }

  const json: any = await res.json();
  return (json.results ?? []) as TavilyResult[];
}

// Compara ignorando mayúsculas/minúsculas y separadores (espacios, guiones,
// puntos): referencias de fabricante se escriben de formas distintas según
// la fuente ("420007", "420-007", "420 007"...).
function normalizeRef(value: string): string {
  return value.toLowerCase().replace(/[\s\-_.]/g, '');
}

function mentionsRef(result: TavilyResult, ref: string): boolean {
  const needle = normalizeRef(ref);
  if (!needle) return false;
  return (
    normalizeRef(result.title).includes(needle) ||
    normalizeRef(result.content).includes(needle) ||
    normalizeRef(result.url).includes(needle)
  );
}

/**
 * Sugiere una descripción de producto en formato ERP.
 *
 * 1. Busca el producto con Tavily (API de búsqueda gratuita, sin tarjeta),
 *    priorizando https://www.matmax.es y usando la web general como respaldo.
 * 2. Le pasa lo encontrado a Gemini (sin su herramienta de búsqueda, que es
 *    de pago) para que redacte la descripción final en formato ERP.
 *
 * Las claves (Tavily y Gemini) viven solo aquí, nunca en el navegador.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { manufacturerName, manufacturerRef } = (req.body ?? {}) as {
    manufacturerName?: string;
    manufacturerRef?: string;
  };

  if (!manufacturerRef) {
    return res.status(400).json({ error: 'Falta la referencia del fabricante' });
  }

  // La referencia entre comillas refuerza la coincidencia exacta de frase
  // en la búsqueda (en vez de que el motor la trate como palabras sueltas).
  const query = `${manufacturerName ?? ''} "${manufacturerRef}"`.trim();

  try {
    // matmax.es bloquea en su robots.txt la página de resultados de
    // búsqueda (/buscar*), así que ningún buscador puede indexar ESA
    // página; solo las fichas de producto individuales (/productos-*, que
    // sí están permitidas). Por eso reforzamos aquí: 'advanced' (mejor
    // ranking semántico) y más resultados en matmax, para tener más
    // posibilidades de dar con la ficha concreta del producto. Vercel nos
    // da 60s (ver vercel.json), así que hay margen de sobra para esto.
    const [matmaxSettled, generalSettled] = await Promise.allSettled([
      tavilySearch(query, { includeDomains: ['matmax.es'], searchDepth: 'advanced', maxResults: 5 }),
      tavilySearch(query, { searchDepth: 'advanced', maxResults: 5 }),
    ]);
    const matmaxResults = matmaxSettled.status === 'fulfilled' ? matmaxSettled.value : [];
    const generalResults = generalSettled.status === 'fulfilled' ? generalSettled.value : [];

    // Unimos ambas listas (matmax primero) y quitamos duplicados por URL.
    const seenUrls = new Set<string>();
    const merged: TavilyResult[] = [];
    for (const r of [...matmaxResults, ...generalResults]) {
      if (seenUrls.has(r.url)) continue;
      seenUrls.add(r.url);
      merged.push(r);
    }

    // Priorizamos los resultados que de verdad mencionan la referencia
    // exacta (en título, URL o contenido): antes, cuando matmax devolvía
    // *algún* resultado aunque no fuera el correcto (p.ej. productos de
    // otra marca que simplemente comparten palabras de la búsqueda), esos
    // resultados irrelevantes tapaban cualquier coincidencia real que
    // hubiera en la búsqueda general. Ahora, si algún resultado (de
    // cualquiera de las dos búsquedas) sí contiene la referencia, solo esos
    // pasan a Gemini; si ninguno la contiene, seguimos con los mejores
    // resultados disponibles como aproximación.
    const withRefMatch = merged.filter(r => mentionsRef(r, manufacturerRef));
    const candidates = (withRefMatch.length > 0 ? withRefMatch : merged).slice(0, 3);

    if (candidates.length === 0) {
      return res.status(200).json({
        description: '',
        sources: [],
        warning: 'No se encontró información sobre este producto en la web. Completa la descripción manualmente.',
      });
    }

    const results = candidates;
    const MAX_CONTENT_CHARS = 800; // con 60s de margen podemos dar más contexto a Gemini
    const context = results
      .map((r, i) => `Fuente ${i + 1} (${r.url}):\n${r.title}\n${r.content.slice(0, MAX_CONTENT_CHARS)}`)
      .join('\n\n');

    const apiKey = requireEnv('GEMINI_API_KEY');
    const ai = new GoogleGenAI({ apiKey });

    // Token que le pedimos a Gemini que devuelva EXACTAMENTE cuando la
    // información encontrada no corresponde al producto, en vez de una
    // frase en prosa. Así el backend puede distinguir con certeza "no hay
    // descripción válida" de "aquí tienes la descripción", en vez de tener
    // que adivinarlo con heurísticas sobre texto libre.
    const NO_MATCH_TOKEN = 'SIN_COINCIDENCIA';

    const refConfirmed = withRefMatch.length > 0;

    const aiResponse = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `A partir de esta información encontrada en la web sobre el producto del fabricante "${manufacturerName ?? ''}" con referencia "${manufacturerRef}", redacta la descripción en formato ERP.

${
  refConfirmed
    ? `(Las fuentes de abajo ya se filtraron para quedarte solo con las que mencionan literalmente la referencia "${manufacturerRef}", así que corresponden a este producto con alta confianza: úsalas con normalidad.)`
    : `(Ninguna fuente disponible menciona literalmente la referencia "${manufacturerRef}"; son el mejor resultado que se encontró, pero podrían no ser este producto exacto. Si no estás razonablemente seguro de que describen este producto, usa la regla 6.)`
}

${context}

REGLAS DE FORMATO ERP:
1. Empieza con el nombre del producto (sustantivo principal).
2. Incluye ESPECIFICACIONES TÉCNICAS (polos, amperaje, dimensiones, color, etc.) si aparecen en la información.
3. TODO EN MAYÚSCULAS.
4. ELIMINA la referencia del fabricante ("REF. XXXX") si aparece al final.
5. NO uses artículos (EL, LA, LOS) ni introducciones.
6. Si la información no parece corresponder realmente a este producto, o no incluye datos técnicos ni descriptivos útiles sobre él, NO escribas ninguna explicación: responde ÚNICAMENTE con la palabra ${NO_MATCH_TOKEN}.
7. Devuelve ÚNICAMENTE el texto de la descripción (o el token del punto 6), sin nada más.`,
      config: {
        // Gemini 3.x usa "thinkingLevel" (no "thinkingBudget", que es de la
        // familia 2.5). LOW acelera mucho la respuesta para una tarea tan
        // sencilla como esta, clave para no superar el límite de Vercel.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const rawText = aiResponse.text?.trim() ?? '';
    const sources = results.map(r => ({ title: r.title, uri: r.url }));

    // Defensa en profundidad: además del token explícito, detectamos si el
    // modelo escribió una explicación en prosa en vez de seguir la regla 6
    // (los LLM no siempre obedecen el formato al 100%), para no acabar
    // metiendo una frase de "no encontré nada" en el campo de descripción.
    const looksLikeRefusal =
      !rawText ||
      rawText.toUpperCase().includes(NO_MATCH_TOKEN) ||
      /^(LA |EL |NO |LA INFORMACI[OÓ]N|INFORMACI[OÓ]N (PROPORCIONADA|ENCONTRADA))/i.test(rawText) &&
        /no (contiene|parece|corresponde|incluye|se encontr[oó])/i.test(rawText);

    if (looksLikeRefusal) {
      return res.status(200).json({
        description: '',
        sources,
        warning: 'La información encontrada en la web no parece corresponder a este producto (o no trae datos técnicos útiles). Completa la descripción manualmente.',
      });
    }

    const description = rawText.toUpperCase();
    return res.status(200).json({ description, sources });
  } catch (err: any) {
    console.error(err);
    const message: string = err?.message ?? 'Error interno';

    if (/429|quota|RESOURCE_EXHAUSTED/i.test(message)) {
      return res.status(429).json({ error: 'Cuota agotada (Tavily o Gemini). Inténtalo de nuevo más tarde.' });
    }
    if (/API_KEY_INVALID|Requested entity was not found|401|Unauthorized/i.test(message)) {
      return res.status(401).json({ error: 'Alguna de las claves configuradas (Tavily o Gemini) no es válida.' });
    }
    // Gemini saturado momentáneamente (pico de demanda): no es un fallo de
    // configuración ni de cuota, así que lo distinguimos para que el
    // frontend pueda mostrar un mensaje claro (y un botón de reintentar)
    // en vez de volcar el JSON crudo del error.
    if (/503|UNAVAILABLE|overloaded|high demand/i.test(message)) {
      return res.status(503).json({ error: 'El modelo de IA está saturado en este momento. Inténtalo de nuevo en unos segundos.' });
    }
    return res.status(500).json({ error: message });
  }
}
