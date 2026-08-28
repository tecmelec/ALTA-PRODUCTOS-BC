import { VercelRequest, VercelResponse } from '@vercel/node';

export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true; // ya respondido, el handler debe cortar
  }
  return false;
}
