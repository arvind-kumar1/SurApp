import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

let indexReady;

// Fixed-window counter in MongoDB so limits hold across serverless instances.
// Returns a 429 response when over the limit, otherwise null.
export async function rateLimit(request, name, limit, windowSec) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
  const windowMs = windowSec * 1000;
  const bucket = Math.floor(Date.now() / windowMs);

  const col = (await getDb()).collection('rate_limits');
  indexReady ||= col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => { indexReady = null; });

  const doc = await col.findOneAndUpdate(
    { _id: `${name}:${ip}:${bucket}` },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 1) * windowMs) } },
    { upsert: true, returnDocument: 'after' }
  );

  if (doc.count <= limit) return null;
  const retryAfter = Math.ceil(((bucket + 1) * windowMs - Date.now()) / 1000);
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}
