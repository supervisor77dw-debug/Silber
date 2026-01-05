// lib/headers.ts
// Utility für No-Cache Headers (Phase "Cache Kill")

import { NextResponse } from 'next/server';

/**
 * Setzt strikte No-Cache Headers auf eine NextResponse
 * Verhindert jegliches Caching auf Client/CDN/Edge
 */
export function setNoCacheHeaders(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}

/**
 * Erstellt eine NextResponse mit JSON Daten und No-Cache Headers
 */
export function jsonResponseNoCache(data: any, status = 200): NextResponse {
  const response = NextResponse.json(data, { status });
  return setNoCacheHeaders(response);
}
