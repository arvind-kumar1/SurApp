// AdSense requires /ads.txt listing your publisher id before it serves ads.
export function GET() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.replace('ca-', '');
  const body = client ? `google.com, ${client}, DIRECT, f08c47fec0942fa0\n` : '';
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
}
