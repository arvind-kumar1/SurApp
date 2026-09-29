import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { rateLimit } from '@/lib/rateLimit';

// ponytail: unofficial JioSaavn API, swap the host if it goes down like musicapi.x007 did
const SAAVN ='https://saavn.sumit.co/api';
const ALLOWED = ['/search/', '/albums?', '/songs?', '/artists/', '/playlists?'];
// Album/song details don't change; searches, artist lists and charts get new releases.
const PERMANENT = ['/albums?', '/songs?'];
const TTL_MS = 12 * 60 * 60 * 1000;

let indexReady;

export async function GET(request) {
  const path = request.nextUrl.searchParams.get('path') || '';
  if (!ALLOWED.some(prefix => path.startsWith(prefix))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const col = (await getDb()).collection('saavn_cache');
    indexReady ||= col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => { indexReady = null; });

    const cached = await col.findOne({ _id: path });
    if (cached) return NextResponse.json({ data: cached.data });

    // Only misses hit the upstream API, so only misses count against the limit.
    const limited = await rateLimit(request, 'saavn', 120, 60);
    if (limited) return limited;

    const response = await fetch(`${SAAVN}${path}`);
    if (!response.ok) return NextResponse.json({ error: 'Upstream error' }, { status: response.status });
    const { data } = await response.json();

    const expiresAt = PERMANENT.some(prefix => path.startsWith(prefix)) ? null : new Date(Date.now() + TTL_MS);
    await col.updateOne({ _id: path }, { $set: { data, expiresAt, savedAt: new Date() } }, { upsert: true });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Saavn cache error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
