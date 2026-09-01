import { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { applyCors } from './_lib/cors';
import { requireEnv } from './_lib/bcClient';

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

async function tavilySearch(query: string, includeDomains?: string[]): Promise<TavilyResult[]> {
  const apiKey = requireEnv('TAVILY_API_KEY');
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      max_results: 3,
      include_domains: includeDomains ?? [],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error consultando Tavily (${res.status}): ${text}`);
  }

  const json: any = await res.json();
  return (json.results ?? []) as TavilyResult[];
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

  const query = `${manufacturerName ?? ''} ${manufacturerRef}`.trim();

  try {
    let results = await tavilySearch(query, ['matmax.es']);
    if (results.length === 0) {
      // Sin resultados en matmax.es: ampliamos a la web general
      // (por ejemplo, la web oficial del fabricante).
      results = await tavilySearch(query);
    }

    if (results.length === 0) {
      return res.status(200).json({
        description: '',
        sources: [],
        warning: 'No se encontró información sobre este producto en la web. Completa la descripción manualmente.',
      });
    }

    const context = results
      .map((r, i) => `Fuente ${i + 1} (${r.url}):\n${r.title}\n${r.content}`)
      .join('\n\n');

    const apiKey = requireEnv('GEMINI_API_KEY');
    const ai = new GoogleGenAI({ apiKey });

    const aiResponse = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `A partir de esta información encontrada en la web sobre el producto del fabricante "${manufacturerName ?? ''}" con referencia "${manufacturerRef}", redacta la descripción en formato ERP.

${context}

REGLAS DE FORMATO ERP:
1. Empieza con el nombre del producto (sustantivo principal).
2. Incluye ESPECIFICACIONES TÉCNICAS (polos, amperaje, dimensiones, color, etc.) si aparecen en la información.
3. TODO EN MAYÚSCULAS.
4. ELIMINA la referencia del fabricante ("REF. XXXX") si aparece al final.
5. NO uses artículos (EL, LA, LOS) ni introducciones.
6. Si la información no parece corresponder realmente a este producto, indícalo claramente en vez de inventar.
7. Devuelve ÚNICAMENTE el texto de la descripción (o el aviso del punto 6).`,
      // Sin herramienta de búsqueda: Gemini solo redacta a partir del
      // contexto que ya le pasamos, así que se mantiene en el nivel gratuito.
    });

    const description = aiResponse.text?.trim().toUpperCase() ?? '';
    const sources = results.map(r => ({ title: r.title, uri: r.url }));

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
    return res.status(500).json({ error: message });
  }
}
