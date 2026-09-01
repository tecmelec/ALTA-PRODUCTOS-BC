import { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { applyCors } from './_lib/cors';
import { requireEnv } from './_lib/bcClient';

/**
 * Sugiere una descripción de producto en formato ERP, usando Gemini con la
 * herramienta de búsqueda de Google activada (grounding). Se le pide que
 * priorice como fuente el portal https://www.matmax.es, ya que es donde
 * suele encontrarse la ficha técnica de fabricantes de material eléctrico.
 *
 * La clave de Gemini vive solo aquí (backend), nunca en el navegador.
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

  try {
    const apiKey = requireEnv('GEMINI_API_KEY');
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Busca el producto del fabricante "${manufacturerName ?? ''}" con referencia "${manufacturerRef}".

Prioriza como fuente el portal especializado MATMAX (https://www.matmax.es), que suele tener la ficha técnica de este tipo de material. Si no encuentras el producto ahí, busca en la web general (por ejemplo, la web oficial del fabricante).

OBJETIVO: Obtener la descripción técnica real y adaptarla al formato ERP.
Ejemplo de referencia:
Fabricante: Solera, Ref: 8004.
Búsqueda -> "Base múltiple 4 tomas 16A blanca Ref. 8004"
Descripción sugerida final -> "BASE MÚLTIPLE 4 TOMAS 16A BLANCA"

REGLAS DE FORMATO ERP:
1. Empieza con el nombre del producto (sustantivo principal).
2. Incluye ESPECIFICACIONES TÉCNICAS (polos, amperaje, dimensiones, color, etc.).
3. TODO EN MAYÚSCULAS.
4. ELIMINA la referencia del fabricante ("REF. XXXX") si aparece al final de la descripción encontrada.
5. NO uses artículos (EL, LA, LOS) ni introducciones.
6. Devuelve ÚNICAMENTE el texto de la descripción.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const description = response.text?.trim().toUpperCase() ?? '';

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources = chunks
      .filter((chunk: any) => chunk.web)
      .map((chunk: any) => ({ title: chunk.web.title as string, uri: chunk.web.uri as string }));

    return res.status(200).json({ description, sources });
  } catch (err: any) {
    console.error(err);
    const message: string = err?.message ?? 'Error interno';

    if (/429|quota|RESOURCE_EXHAUSTED/i.test(message)) {
      return res.status(429).json({ error: 'Cuota de Gemini agotada. Inténtalo de nuevo más tarde.' });
    }
    if (/API_KEY_INVALID|Requested entity was not found/i.test(message)) {
      return res.status(401).json({ error: 'La clave de Gemini configurada no es válida.' });
    }
    return res.status(500).json({ error: message });
  }
}
