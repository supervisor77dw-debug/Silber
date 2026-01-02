export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response('OK - Silver Market Analysis API is running', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}
