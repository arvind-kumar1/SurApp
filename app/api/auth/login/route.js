import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { verifyPassword, signToken, getCookieOptions, COOKIE_NAME } from '@/lib/auth';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    const db = await getDb();
    const users = db.collection('users');

    const user = await users.findOne({ email: cleanEmail });
    if (!user) {
      return NextResponse.json({ error: 'Wrong email or password.' }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: 'Wrong email or password.' }, { status: 401 });
    }

    const userId = user._id.toString();
    const token = await signToken({
      id: userId,
      email: user.email,
      name: user.name
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
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

    response.cookies.set(COOKIE_NAME, token, getCookieOptions());
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to log in. Please check database connection.' },
      { status: 500 }
    );
  }
}
