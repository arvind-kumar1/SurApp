import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { rateLimit } from '@/lib/rateLimit';
import { hashPassword, signToken, getCookieOptions, COOKIE_NAME } from '@/lib/auth';

export async function POST(request) {
  try {
    const limited = await rateLimit(request, 'signup', 5, 60 * 60);
    if (limited) return limited;

    const { name, email, password, initialData } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    const db = await getDb();
    const users = db.collection('users');

    const existing = await users.findOne({ email: cleanEmail });
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Log in instead.' },
        { status: 409 }
      );
    }

    const hashedPassword = await hashPassword(password);

    const newUser = {
      name: cleanName,
      email: cleanEmail,
      password: hashedPassword,
      profile: initialData?.profile || { name: cleanName, languages: [], artists: [] },
      liked: Array.isArray(initialData?.liked) ? initialData.liked : [],
      favArtists: Array.isArray(initialData?.favArtists) ? initialData.favArtists : [],
      downloads: Array.isArray(initialData?.downloads) ? initialData.downloads : [],
      history: Array.isArray(initialData?.history) ? initialData.history : [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await users.insertOne(newUser);
    const userId = result.insertedId.toString();

    const token = await signToken({
      id: userId,
      email: cleanEmail,
      name: cleanName
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        name: cleanName,
        email: cleanEmail
      },
      data: {
        profile: newUser.profile,
        liked: newUser.liked,
        favArtists: newUser.favArtists,
        downloads: newUser.downloads,
        history: newUser.history
      }
    });

    response.cookies.set(COOKIE_NAME, token, getCookieOptions());
    return response;
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create account. Please check database connection.' },
      { status: 500 }
    );
  }
}
