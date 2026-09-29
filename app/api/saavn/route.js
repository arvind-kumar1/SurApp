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

// "Bipolar " and "bipolar" are the same search, so they share one cache entry.
const normalize = path => path.startsWith('/search/')
  ? path.replace(/query=([^&]*)/, (match, q) => {
    try { return `query=${encodeURIComponent(decodeURIComponent(q).toLowerCase().trim().replace(/\s+/g, ' '))}`; } catch { return match; }
  })
  : path;

// Every response that carries full song objects.
const songsIn = (path, data) => {
  const list = path.startsWith('/songs?') ? data : path.startsWith('/search/songs') ? data?.results : data?.songs;
  return Array.isArray(list) ? list.filter(song => song?.id) : [];
};

// Each song is stored on its own, so any later request for it is served from the DB.
// Artist lists come without playCount, so they never overwrite a copy that has one.
const saveSongs = (col, songs) => songs.length && col.bulkWrite(songs.map(song => ({
  updateOne: {
    filter: { _id: song.id },
    update: song.playCount != null ? { $set: { data: song, savedAt: new Date() } } : { $setOnInsert: { data: song, savedAt: new Date() } },
    upsert: true
  }
})), { ordered: false });

export async function GET(request) {
  const path = normalize(request.nextUrl.searchParams.get('path') || '');
  if (!ALLOWED.some(prefix => path.startsWith(prefix))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const db = await getDb();
    const col = db.collection('saavn_cache');
    const songs = db.collection('saavn_songs');
    indexReady ||= col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => { indexReady = null; });

    // Only misses hit the upstream API, so only misses count against the limit.
    const upstream = async upstreamPath => {
      const limited = await rateLimit(request, 'saavn', 120, 60);
      if (limited) return { limited };
      const response = await fetch(`${SAAVN}${upstreamPath}`);
      if (!response.ok) return { error: NextResponse.json({ error: 'Upstream error' }, { status: response.status }) };
      const { data } = await response.json();
      await saveSongs(songs, songsIn(upstreamPath, data));
      return { data };
    };

    // Song lookups are answered song by song: only ids the DB has never seen go upstream.
    if (path.startsWith('/songs?')) {
      const ids = (new URLSearchParams(path.slice(path.indexOf('?') + 1)).get('ids') || '').split(',').filter(Boolean);
      const docs = await songs.find({ _id: { $in: ids }, 'data.playCount': { $ne: null } }).toArray();
      const found = new Map(docs.map(doc => [doc._id, doc.data]));
      const missing = ids.filter(id => !found.has(id));
      if (missing.length) {
        const { limited, error, data } = await upstream(`/songs?ids=${missing.join(',')}`);
        if (limited || error) return limited || error;
        songsIn('/songs?', data).forEach(song => found.set(song.id, song));
      }
      return NextResponse.json({ data: ids.map(id => found.get(id)).filter(Boolean) });
    }

    const cached = await col.findOne({ _id: path });
    if (cached) return NextResponse.json({ data: cached.data });

    const { limited, error, data } = await upstream(path);
    if (limited || error) return limited || error;

    const expiresAt = PERMANENT.some(prefix => path.startsWith(prefix)) ? null : new Date(Date.now() + TTL_MS);
    await col.updateOne({ _id: path }, { $set: { data, expiresAt, savedAt: new Date() } }, { upsert: true });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Saavn cache error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
