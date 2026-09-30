import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/mongodb';
import { rateLimit } from '@/lib/rateLimit';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

// Google's sample non-skippable linear VAST tag: safe to test with before Ad Manager approves the account.
const TEST_TAG = 'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples&sz=640x480&cust_params=sample_ct%3Dlinear&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=';
const DEFAULTS = { enabled: false, adTag: TEST_TAG, songsPerAd: 3, bannerEnabled: false, bannerSlot: '' };

async function isAdmin() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const payload = token && await verifyToken(token);
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
  return Boolean(payload?.email && admins.includes(payload.email.toLowerCase()));
}

const settings = async () => {
  const { _id, ...saved } = (await (await getDb()).collection('app_settings').findOne({ _id: 'ads' })) || {};
  return { ...DEFAULTS, ...saved };
};

export async function GET(request) {
  const limited = await rateLimit(request, 'ads-get', 60, 60);
  if (limited) return limited;
  try {
    const admin = await isAdmin();
    return NextResponse.json({
      ...(await settings()),
      isAdmin: admin,
      adsenseClient: process.env.NEXT_PUBLIC_ADSENSE_CLIENT || ''
    });
  } catch (error) {
    console.error('Ads settings error:', error);
    return NextResponse.json({ ...DEFAULTS, isAdmin: false, adsenseClient: '' });
  }
}

export async function POST(request) {
  const limited = await rateLimit(request, 'ads-post', 20, 60);
  if (limited) return limited;
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const update = {};
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled;
  if (typeof body.bannerEnabled === 'boolean') update.bannerEnabled = body.bannerEnabled;
  if (typeof body.bannerSlot === 'string') update.bannerSlot = body.bannerSlot.trim();
  if (typeof body.adTag === 'string') {
    const adTag = body.adTag.trim() || TEST_TAG;
    if (!adTag.startsWith('https://') || adTag.length > 2000) {
      return NextResponse.json({ error: 'Ad tag must be an https:// VAST URL' }, { status: 400 });
    }
    update.adTag = adTag;
  }

  await (await getDb()).collection('app_settings').updateOne({ _id: 'ads' }, { $set: update }, { upsert: true });
  return NextResponse.json({
    ...(await settings()),
    isAdmin: true,
    adsenseClient: process.env.NEXT_PUBLIC_ADSENSE_CLIENT || ''
  });
}
