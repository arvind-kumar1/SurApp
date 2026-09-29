import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { rateLimit } from '@/lib/rateLimit';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

async function getAuthUserId() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload?.id || null;
}

export async function GET(request) {
  try {
    const limited = await rateLimit(request, 'data-get', 60, 60);
    if (limited) return limited;

    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { profile: 1, liked: 1, favArtists: 1, downloads: 1, history: 1 } }
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      profile: user.profile || null,
      liked: user.liked || [],
      favArtists: user.favArtists || [],
      downloads: user.downloads || [],
      history: user.history || []
    });
  } catch (error) {
    console.error('Fetch user data error:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const limited = await rateLimit(request, 'data-post', 30, 60);
    if (limited) return limited;

    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const updateFields = { updatedAt: new Date() };

    if ('profile' in body && body.profile !== undefined) {
      updateFields.profile = body.profile;
      if (body.profile?.name) updateFields.name = body.profile.name;
    }
    if ('liked' in body && Array.isArray(body.liked)) {
      updateFields.liked = body.liked;
    }
    if ('favArtists' in body && Array.isArray(body.favArtists)) {
      updateFields.favArtists = body.favArtists.slice(0, 200);
    }
    if ('downloads' in body && Array.isArray(body.downloads)) {
      updateFields.downloads = body.downloads;
    }
    if ('history' in body && Array.isArray(body.history)) {
      updateFields.history = body.history.slice(0, 50);
    }

    const db = await getDb();
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $set: updateFields }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update user data error:', error);
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 });
  }
}
