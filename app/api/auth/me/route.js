import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { rateLimit } from '@/lib/rateLimit';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

export async function GET(request) {
  try {
    const limited = await rateLimit(request, 'me', 60, 60);
    if (limited) return limited;

    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json({ user: null });
    }

    const payload = await verifyToken(token);
    if (!payload || !payload.id) {
      return NextResponse.json({ user: null });
    }

    const db = await getDb();
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(payload.id) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email
      },
      data: {
        profile: user.profile || { name: user.name, languages: [], artists: [] },
        liked: user.liked || [],
        downloads: user.downloads || [],
        history: user.history || []
      }
    });
  } catch (error) {
    console.error('Session verification error:', error);
    return NextResponse.json({ user: null });
  }
}
