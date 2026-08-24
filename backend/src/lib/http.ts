import { HttpResponseInit } from "@azure/functions";

export function corsHeaders(): Record<string, string> {
  const origin = process.env.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
    body: JSON.stringify(body),
  };
}

export function noContent(): HttpResponseInit {
  return { status: 204, headers: corsHeaders() };
}

export function preflight(): HttpResponseInit {
  return { status: 204, headers: corsHeaders() };
}
