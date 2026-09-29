'use client';

import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { track as trackEvent } from '@vercel/analytics';
import DetailView from './DetailView';
import AdBreak from './AdBreak';

// Used until the listener picks their own artists in onboarding.
const DEFAULT_ARTISTS = [
  { id: '697691', name: 'Karan Aujla', img: 'https://c.saavncdn.com/artists/Karan_Aujla_005_20260925061936_500x500.jpg' },
  { id: '5439289', name: 'Arjan Dhillon', img: 'https://c.saavncdn.com/artists/Arjan_Dhillon_001_20260525181943_500x500.jpg' }
];

// Onboarding suggestions per language; names are resolved to JioSaavn artists live. ids match JioSaavn's song.language.
const LANGUAGES = [
  { id: 'punjabi', chart: '1134543511', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', artists: ['Karan Aujla', 'Arjan Dhillon', 'Sidhu Moose Wala', 'Diljit Dosanjh', 'AP Dhillon', 'Shubh', 'Amrinder Gill', 'Ammy Virk', 'Babbu Maan', 'Satinder Sartaaj', 'Jass Manak', 'Gurnam Bhullar'] },
  { id: 'hindi', chart: '1134543272', label: 'Hindi', native: 'हिन्दी', artists: ['Arijit Singh', 'Shreya Ghoshal', 'Atif Aslam', 'Badshah', 'Jubin Nautiyal', 'Neha Kakkar', 'Pritam', 'Vishal Mishra', 'Darshan Raval', 'Sonu Nigam'] },
  { id: 'english', chart: '1134595537', label: 'English', native: 'English', artists: ['Taylor Swift', 'The Weeknd', 'Ed Sheeran', 'Drake', 'Billie Eilish', 'Dua Lipa', 'Justin Bieber', 'Post Malone'] },
  { id: 'haryanvi', chart: '1134770917', label: 'Haryanvi', native: 'हरियाणवी', artists: ['Masoom Sharma', 'Diler Kharkiya', 'Amit Saini Rohtakiya', 'Raju Punjabi', 'Sapna Choudhary'] },
  { id: 'bhojpuri', chart: '1134768973', label: 'Bhojpuri', native: 'भोजपुरी', artists: ['Pawan Singh', 'Khesari Lal Yadav', 'Arvind Akela Kallu', 'Shilpi Raj'] },
  { id: 'tamil', chart: '1134651042', label: 'Tamil', native: 'தமிழ்', artists: ['Anirudh Ravichander', 'A.R. Rahman', 'Sid Sriram', 'Yuvan Shankar Raja'] },
  { id: 'telugu', chart: '1134643225', label: 'Telugu', native: 'తెలుగు', artists: ['Devi Sri Prasad', 'Thaman S', 'Sid Sriram', 'Mangli'] },
  { id: 'marathi', chart: '1134710071', label: 'Marathi', native: 'मराठी', artists: ['Ajay-Atul', 'Avadhoot Gupte', 'Adarsh Shinde'] }
];

// No API lists unreleased albums — add announced ones here and they show on Home.
// e.g. { name: 'Album name', artist: 'Karan Aujla', date: '2026-12-01', img: 'https://…' }
const upcoming = [];

const decode = value => String(value || '').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');
const norm = value => String(value).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const sameTitle = (a, b) => norm(a).includes(norm(b)) || norm(b).includes(norm(a));
const keyOf = track => track.id || `${track.song}|${track.artist}`;
const fmt = seconds => !seconds || !isFinite(seconds) ? '0:00' : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const mapSong = item => ({
  id: item.id,
  song: decode(item.name),
  artist: decode(item.artists?.primary?.map(a => a.name).join(', ')) || 'Unknown',
  album: decode(item.album?.name),
  albumId: item.album?.id,
  year: item.year,
  duration: Number(item.duration) || 0,
  artistImg: item.artists?.primary?.[0]?.image?.at(-1)?.url || '',
  language: item.language,
  label: decode(item.label),
  playCount: Number(item.playCount) || 0,
  img: item.image?.at(-1)?.url || '',
  url: item.downloadUrl?.at(-1)?.url || '',
  source: 'api'
});

// JioSaavn's all-India chart; each language above also has its own Top 50 `chart` playlist.
const CHARTS_ID = '1134548194';
const TILE_COLORS = ['#e13300', '#1e3264', '#8d67ab', '#e8115b', '#148a08', '#bc5900', '#509bf5', '#af2896', '#27856a', '#dc148c', '#8c1932', '#477d95'];

// Accounts and user library data are backed by MongoDB Atlas with HTTP-only JWT sessions.
const readJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };

async function signUp({ name, email, password }, initialData) {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, initialData })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to sign up.');
  return data;
}

async function logIn({ email, password }) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to log in.');
  return data;
}

const ours = (track, names) => names.some(name => track.artist?.includes(name));
const interleave = lists => Array.from({ length: Math.max(0, ...lists.map(list => list.length)) }, (_, i) => lists.map(list => list[i])).flat().filter(Boolean);
const artistSet = track => (track.artist || '').split(',').map(norm).filter(Boolean);
const compact = new Intl.NumberFormat('en', { notation: 'compact' });

// No service exposes genre, so "similar" = shared collaborators/producers, language, label, era, popularity.
// prefs = { names: favourite artist names, languages: chosen language ids } from onboarding.
function similarity(seed, candidate, prefs) {
  const seedArtists = artistSet(seed);
  let score = artistSet(candidate).filter(name => seedArtists.includes(name)).length * 3;
  if (seed.language && seed.language === candidate.language) score += 3;
  if (seed.label && seed.label === candidate.label) score += 1;
  if (seed.album && seed.album === candidate.album) score += 1;
  if (seed.year && candidate.year) score += Math.max(0, 2 - Math.abs(seed.year - candidate.year) / 2);
  if (ours(candidate, prefs.names)) score += 2;
  if (prefs.languages.includes(candidate.language)) score += 2;
  return score + Math.log10(candidate.playCount + 1) / 3;
}

// Same song often exists under several ids (single + album), so everything is matched by title too.
const played = tracks => new Set(tracks.flatMap(track => [keyOf(track), norm(track.song)]));
const isIn = (set, track) => set.has(keyOf(track)) || set.has(norm(track.song));

function pickSimilar(seed, pool, exclude, prefs) {
  let best = null;
  let bestScore = -Infinity;
  for (const candidate of pool) {
    if (isIn(exclude, candidate) || sameTitle(candidate.song, seed.song)) continue;
    const score = similarity(seed, candidate, prefs);
    if (score > bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

// Recent plays weigh more: the last song counts fully, the one before half, and so on.
function recommend(seeds, pool, count, prefs) {
  const exclude = played(seeds);
  const recent = seeds.slice(0, 5);
  return pool.filter(candidate => !isIn(exclude, candidate) && exclude.add(norm(candidate.song)))
    .map(candidate => [candidate, recent.reduce((sum, seed, i) => sum + similarity(seed, candidate, prefs) / (i + 1), 0)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([candidate]) => candidate);
}

const mapAlbum = item => ({
  id: item.id,
  name: decode(item.name),
  year: item.year,
  count: item.songCount || 0,
  songCount: item.songCount || 0,
  artist: decode(item.artists?.primary?.map(a => a.name).join(', ')),
  artistImg: item.artists?.primary?.[0]?.image?.at(-1)?.url || '',
  img: item.image?.at(-1)?.url || ''
});

const apiCache = new Map();
const apiInFlight = new Map();

async function api(path, signal) {
  if (apiCache.has(path)) {
    return apiCache.get(path);
  }
  if (apiInFlight.has(path)) {
    return apiInFlight.get(path);
  }

  const promise = (async () => {
    try {
      const response = await fetch(`/api/saavn?path=${encodeURIComponent(path)}`, { signal });
      if (!response.ok) throw new Error(response.status);
      const json = await response.json();
      const data = json.data;
      apiCache.set(path, data);
      return data;
    } finally {
      apiInFlight.delete(path);
    }
  })();

  apiInFlight.set(path, promise);
  return promise;
}

async function saavnSearch(q, signal, page = 1) {
  const data = await api(`/search/songs?query=${encodeURIComponent(q)}&limit=20${page > 1 ? `&page=${page}` : ''}`, signal);
  return (data?.results || []).map(mapSong).filter(item => item.url);
}

// Songs JioSaavn doesn't have. No url: playTrack re-checks JioSaavn, then falls back to the 30s Apple preview.
async function itunesSearch(q, signal) {
  const response = await fetch(`https://itunes.apple.com/search?entity=song&country=IN&limit=15&term=${encodeURIComponent(q)}`, { signal });
  if (!response.ok) return [];
  return ((await response.json()).results || []).filter(item => item.previewUrl).map(item => ({
    id: `it-${item.trackId}`,
    song: item.trackName,
    artist: item.artistName,
    album: item.collectionName,
    year: item.releaseDate?.slice(0, 4),
    duration: Math.round((item.trackTimeMillis || 0) / 1000),
    img: item.artworkUrl100?.replace('100x100', '500x500') || '',
    url: '',
    source: 'itunes'
  }));
}
const sameSong = (a, b) => sameTitle(a.song, b.song) && norm(a.artist).includes(norm(b.artist.split(/,|&/)[0]));

const artistCache = new Map();
async function findArtists(q, limit, signal) {
  const key = `${norm(q)}|${limit}`;
  if (!artistCache.has(key)) {
    const data = await api(`/search/artists?query=${encodeURIComponent(q)}&limit=${limit}`, signal);
    artistCache.set(key, (data?.results || []).map(item => ({ id: item.id, name: decode(item.name), img: item.image?.at(-1)?.url || '' })));
  }
  return artistCache.get(key);
}

async function searchAll(q, names, signal) {
  const [saavnSongs, appleSongs, albums, foundArtists] = await Promise.all([
    saavnSearch(q, signal),
    itunesSearch(q, signal).catch(error => { if (error.name === 'AbortError') throw error; return []; }),
    api(`/search/albums?query=${encodeURIComponent(q)}&limit=12`, signal).then(data => (data?.results || []).map(mapAlbum)),
    findArtists(q, 6, signal)
  ]);
  const first = (a, b) => ours(b, names) - ours(a, names);
  const extra = appleSongs.filter(apple => !saavnSongs.some(song => sameSong(song, apple)));
  return { songs: [...saavnSongs.sort(first), ...extra], albums: albums.sort(first), artists: foundArtists, page: 1, more: saavnSongs.length >= 20 };
}

const searchTabs = [['all', 'All'], ['songs', 'Songs'], ['albums', 'Albums'], ['artists', 'Artists']];

// Same song replayed = no new request.
const memo = fn => {
  const cache = new Map();
  return track => {
    const key = `${track.song}|${track.artist}`;
    if (!cache.has(key)) cache.set(key, fn(track).catch(error => { cache.delete(key); throw error; }));
    return cache.get(key);
  };
};

const itunesPreview = memo(async track => {
  const response = await fetch(`https://itunes.apple.com/search?entity=song&limit=5&term=${encodeURIComponent(`${track.song} ${track.artist}`)}`);
  if (!response.ok) return null;
  const data = await response.json();
  return data.results?.find(item => item.previewUrl && sameTitle(item.trackName, track.song)) || null;
});

const fetchLyrics = memo(async track => {
  const artist = track.artist.split(',')[0].trim();
  const response = await fetch(`https://lrclib.net/api/search?track_name=${encodeURIComponent(track.song)}&artist_name=${encodeURIComponent(artist)}`);
  if (!response.ok) return { lines: [] };
  const hits = (await response.json()).filter(item => sameTitle(item.trackName, track.song));
  const hit = hits.find(item => item.syncedLyrics) || hits.find(item => item.plainLyrics);
  if (hit?.syncedLyrics) {
    const lines = hit.syncedLyrics.split('\n').map(line => {
      const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
      return match && match[3] ? { t: Number(match[1]) * 60 + Number(match[2]), text: match[3] } : null;
    }).filter(Boolean);
    return { lines, synced: true };
  }
  return { lines: (hit?.plainLyrics || '').split('\n').map(text => ({ t: null, text })) };
});

const icons = {
  back: 'M19 12H5M12 19l-7-7 7-7',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  folder: 'M3 6h6l2 2h10v11H3z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  right: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  play: 'M8 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z',
  pause: 'M7 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM14 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
  prev: 'M18 6.5v11a1 1 0 0 1-1.55.83L8.5 13a1.2 1.2 0 0 1 0-2l7.95-5.33A1 1 0 0 1 18 6.5zM5 5h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5z',
  next: 'M6 6.5v11a1 1 0 0 0 1.55.83L15.5 13a1.2 1.2 0 0 0 0-2L7.55 5.67A1 1 0 0 0 6 6.5zM19 5h-2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2z',
  heart: 'M12 20s-8-5-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15 12 20 12 20z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  close: 'M6 6l12 12M18 6L6 18',
  disc: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  user: 'M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0',
  album: 'M4 4h16v16H4zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  library: 'M4 4v16M9 4v16M14 5l5 15',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  shuffle: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  repeat: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  automix: 'M2 17h20M2 7h20M7 3v8M17 13v8M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  plus: 'M12 5v14M5 12h14',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  more: 'M12 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  circlePlus: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v8M8 12h8',
  circleCheck: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12l3 3 5-6',
  circleDownload: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v9M8 12l4 4 4-4'
};

function Icon({ name, fill = false, size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={fill ? 0 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name]} /></svg>;
}

function updateFavicon(url) {
  if (typeof document === 'undefined') return;
  try {
    const existing = document.querySelectorAll("link[rel*='icon']");
    existing.forEach(el => el.remove());
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = url.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg';
    link.href = url;
    document.head.appendChild(link);
  } catch {}
}

// App icon: rendered from /icon.png
function Logo({ size = 38 }) {
  return <img className="logo" src="/icon.png" width={size} height={size} alt="Sur" style={{ borderRadius: size > 40 ? 14 : 11, objectFit: 'cover' }} />;
}

function Brand() {
  return <div className="brand"><Logo /><span className="wordmark">Sur</span></div>;
}

function Header({ title, onBack, action }) {
  return <header className="searchTitle">
    <button className="searchBack" onClick={onBack} aria-label="Back"><Icon name="back" size={22} /></button>
    {title && <h1>{title}</h1>}
    {action && <span className="headerAction">{action}</span>}
  </header>;
}

function TrackRow({ track, index, right, onPlay, active, sub, round }) {
  return <button className={`row ${active ? 'active' : ''} ${round ? 'round' : ''}`} onClick={onPlay}>
    {index != null && <span className="rowIndex">{index}.</span>}
    <img className="rowImg" src={track.img} alt="" loading="lazy" />
    <span className="rowText"><strong>{track.song}</strong><small>{sub || track.artist}</small></span>
    {right && <span className="rowRight">{right}</span>}
  </button>;
}

function AlbumCard({ album, onOpen }) {
  return <button className="album" onClick={() => onOpen(album)}>
    <img src={album.img} alt="" loading="lazy" />
    <strong>{album.name}</strong>
    <small>{[album.year, album.artist].filter(Boolean).join(' · ')}</small>
  </button>;
}

function ShimmerCards({ count = 6 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="album shimmerCard" aria-hidden="true">
          <div className="shimmerImg shimmer" />
          <div className="shimmerLine shimmer" style={{ width: `${Math.floor(65 + (i * 11) % 25)}%`, height: '14px', marginTop: '10px' }} />
          <div className="shimmerLine shimmer" style={{ width: `${Math.floor(40 + (i * 7) % 25)}%`, height: '11px', marginTop: '6px' }} />
        </div>
      ))}
    </>
  );
}

function ShimmerTrackRows({ count = 6 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="row shimmerRow" aria-hidden="true">
          <div className="shimmerIndex shimmer" />
          <div className="shimmerThumb shimmer" />
          <div className="rowText">
            <div className="shimmerLine shimmer" style={{ width: `${Math.floor(55 + (i * 13) % 35)}%`, height: '13px' }} />
            <div className="shimmerLine shimmer" style={{ width: `${Math.floor(35 + (i * 9) % 30)}%`, height: '10px', marginTop: '5px' }} />
          </div>
          <div className="shimmerRight shimmer" />
        </div>
      ))}
    </>
  );
}

function AuthModal({ mode: initialMode, defaultName, onDone, onClose }) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState(defaultName || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isSignup = mode === 'signup';

  const submit = async event => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const clientData = {
        profile: readJSON('sur-profile', null),
        liked: readJSON('kax-liked', []),
        favArtists: readJSON('sur-fav-artists', []),
        downloads: readJSON('psf-downloads', []),
        history: readJSON('kax-history', [])
      };
      const res = await (isSignup ? signUp({ name, email, password }, clientData) : logIn({ email, password }));
      onDone(res.user, res.data);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return <div className="onboardOverlay" onClick={onClose}>
    <form className="onboard auth" role="dialog" aria-modal="true" aria-labelledby="authTitle" onClick={event => event.stopPropagation()} onSubmit={submit}>
      <div className="onboardTop">
        <Logo size={40} />
        <span className="stepper" />
        <button type="button" className="iconBtn" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
      </div>
      <div className="onboardBody">
        <h2 id="authTitle">{isSignup ? 'Sign up to start listening' : 'Log in to Sur'}</h2>
        <p>{isSignup ? 'Create a free account to play songs, like them and build your library.' : 'Welcome back. Log in to keep listening.'}</p>
        {isSignup && <label className="field"><span>Name</span><input value={name} onChange={event => setName(event.target.value)} required maxLength={30} autoComplete="name" /></label>}
        <label className="field"><span>Email</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" autoFocus={!isSignup || Boolean(defaultName)} /></label>
        <label className="field"><span>Password</span><input type="password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder={isSignup ? 'At least 8 characters' : ''} /></label>
        {error && <div className="formError" role="alert">{error}</div>}
      </div>
      <div className="onboardFoot">
        <span>{isSignup ? 'Already have an account?' : 'New to Sur?'} <button type="button" className="linkBtn" onClick={() => { setMode(isSignup ? 'login' : 'signup'); setError(''); }}>{isSignup ? 'Log in' : 'Sign up'}</button></span>
        <button className="playAll" disabled={busy}>{busy ? 'Please wait…' : isSignup ? 'Sign up' : 'Log in'}</button>
      </div>
    </form>
  </div>;
}

const STEPS = ['About you', 'Languages', 'Artists'];

function Onboarding({ initial, onDone, onClose }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial?.name || '');
  const [languages, setLanguages] = useState(initial?.languages || []);
  const [picked, setPicked] = useState(initial?.artists || []);
  const [suggested, setSuggested] = useState(null);
  const [artistQuery, setArtistQuery] = useState('');
  const [found, setFound] = useState([]);

  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    setSuggested(null);
    const names = [...new Set(LANGUAGES.filter(l => languages.includes(l.id)).flatMap(l => l.artists))];
    Promise.all(names.map(n => findArtists(n, 1).then(list => list[0]).catch(() => null)))
      .then(list => { if (!cancelled) setSuggested(list.filter((a, i) => a && list.findIndex(b => b?.id === a.id) === i)); });
    return () => { cancelled = true; };
  }, [step, languages]);

  useEffect(() => {
    const q = artistQuery.trim();
    if (!q) { setFound([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => findArtists(q, 8, controller.signal).then(setFound).catch(() => {}), 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [artistQuery]);

  const isPicked = a => picked.some(p => p.id === a.id);
  const toggleArtist = a => setPicked(list => isPicked(a) ? list.filter(p => p.id !== a.id) : [...list, a]);
  const toggleLanguage = id => setLanguages(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const canNext = [name.trim(), languages.length, picked.length][step];
  const next = () => step < 2 ? setStep(step + 1) : onDone({ name: name.trim(), languages, artists: picked });
  const artistList = artistQuery.trim() ? found : suggested;

  return <div className="onboardOverlay">
    <div className="onboard" role="dialog" aria-modal="true" aria-labelledby="onboardTitle">
      <div className="onboardTop">
        {step > 0 ? <button className="iconBtn" onClick={() => setStep(step - 1)} aria-label="Back"><Icon name="back" /></button> : <Logo size={40} />}
        <ol className="stepper" aria-label={`Step ${step + 1} of 3`}>
          {STEPS.map((label, i) => <li key={label} className={i === step ? 'on' : i < step ? 'done' : ''}><span>{i < step ? '✓' : i + 1}</span>{label}</li>)}
        </ol>
        {onClose && <button className="iconBtn" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>}
      </div>

      <div className="onboardBody">
        {step === 0 && <>
          <h2 id="onboardTitle">Welcome to <span className="wordmark">Sur</span></h2>
          <p>Let's set up your music. What should we call you?</p>
          <input className="bigInput" autoFocus value={name} onChange={event => setName(event.target.value)} onKeyDown={event => event.key === 'Enter' && canNext && next()} placeholder="Your name" maxLength={30} aria-label="Your name" />
        </>}

        {step === 1 && <>
          <h2 id="onboardTitle">Hi {name.trim()}, what do you listen to?</h2>
          <p>Pick one or more languages.</p>
          <div className="choices">
            {LANGUAGES.map(l => <button key={l.id} className={`choice ${languages.includes(l.id) ? 'on' : ''}`} aria-pressed={languages.includes(l.id)} onClick={() => toggleLanguage(l.id)}>
              <strong>{l.native}</strong><small>{l.label}</small>
            </button>)}
          </div>
        </>}

        {step === 2 && <>
          <h2 id="onboardTitle">Choose your artists</h2>
          <p>Pick a few you love. Your home, trending and recommendations follow them.</p>
          <label className="search small">
            <input value={artistQuery} onChange={event => setArtistQuery(event.target.value)} placeholder="Search any artist" aria-label="Search artists" />
            <Icon name="search" />
          </label>
          <div className="artistPick">
            {!artistList && <div className="empty">Finding artists…</div>}
            {artistList?.length === 0 && <div className="empty">No artists found.</div>}
            {artistList?.map(a => <button key={a.id} className={`pick ${isPicked(a) ? 'on' : ''}`} aria-pressed={isPicked(a)} onClick={() => toggleArtist(a)}>
              <span className="pickImg"><img src={a.img} alt="" loading="lazy" />{isPicked(a) && <em>✓</em>}</span>
              <small>{a.name}</small>
            </button>)}
          </div>
        </>}
      </div>

      <div className="onboardFoot">
        <span>{step === 2 ? `${picked.length} selected` : `Step ${step + 1} of 3`}</span>
        <button className="playAll" disabled={!canNext} onClick={next}>{step < 2 ? 'Continue' : 'Start listening'}</button>
      </div>
    </div>
  </div>;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTab, setSearchTab] = useState('all');
  const [results, setResults] = useState({ songs: [], albums: [], artists: [] });
  const [searching, setSearching] = useState(false);
  const [liked, setLiked] = useState([]);
  const [favArtists, setFavArtists] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [pages, setPages] = useState({});
  const [stack, setStack] = useState(['home']);
  const [artist, setArtist] = useState(DEFAULT_ARTISTS[0]);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);
  const [editingTaste, setEditingTaste] = useState(false);
  const [user, setUser] = useState(null);
  const [auth, setAuth] = useState(null);
  const [collection, setCollection] = useState(null);
  const [tileArt, setTileArt] = useState({});
  const [album, setAlbum] = useState(null);
  const [selectedSong, setSelectedSong] = useState(null);
  const [lyrics, setLyrics] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [queueMode, setQueueMode] = useState('radio');
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [history, setHistory] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);
  const [stats, setStats] = useState({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [automix, setAutomix] = useState(() => {
    try {
      const saved = localStorage.getItem('sur-automix');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [crossfadeSec, setCrossfadeSec] = useState(() => {
    try {
      const saved = localStorage.getItem('sur-crossfade');
      return saved ? Number(saved) : 6;
    } catch {
      return 6;
    }
  });
  const [isMixing, setIsMixing] = useState(false);
  const transitioningRef = useRef(false);
  const prefetchingRef = useRef(false);
  const stepRef = useRef();
  const togglePlayRef = useRef();
  const seekToRef = useRef();
  const audioRef = useRef(null);
  const streamRef = useRef('');
  const loadingRef = useRef(new Set());
  const lyricsRef = useRef(null);
  const searchCache = useRef(new Map());
  const scrollRef = useRef(null);
  const view = stack.at(-1);

  // Prevent unwanted mobile zooming and double-tap zoom across devices
  useEffect(() => {
    let lastTouchEnd = 0;
    const preventDoubleTap = event => {
      const now = Date.now();
      if (now - lastTouchEnd <= 350) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    };
    const preventGesture = event => {
      event.preventDefault();
    };

    document.addEventListener('touchend', preventDoubleTap, { passive: false });
    document.addEventListener('gesturestart', preventGesture, { passive: false });
    document.addEventListener('gesturechange', preventGesture, { passive: false });
    document.addEventListener('dblclick', preventGesture, { passive: false });

    return () => {
      document.removeEventListener('touchend', preventDoubleTap);
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('dblclick', preventGesture);
    };
  }, []);

  // Ensure views (especially playerScreen) always start scrolled to the top
  useEffect(() => {
    const resetScroll = () => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    resetScroll();
    const id = requestAnimationFrame(resetScroll);
    return () => cancelAnimationFrame(id);
  }, [view, currentTrack?.id]);

  const addSearchQuery = term => {
    const clean = term?.trim();
    if (!clean) return;
    setSearchHistory(prev => {
      const next = [clean, ...prev.filter(x => norm(x) !== norm(clean))].slice(0, 10);
      try { localStorage.setItem('sur-search-history', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Batches changes into one POST, and skips fields the server already has.
  const syncTimeoutRef = useRef(null);
  const pendingSyncRef = useRef({});
  const lastSyncedRef = useRef({});
  const syncUserData = patch => {
    if (!user) return;
    for (const [key, value] of Object.entries(patch)) {
      if (lastSyncedRef.current[key] === JSON.stringify(value)) delete pendingSyncRef.current[key];
      else pendingSyncRef.current[key] = value;
    }
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    if (!Object.keys(pendingSyncRef.current).length) return;
    syncTimeoutRef.current = setTimeout(() => {
      const body = pendingSyncRef.current;
      pendingSyncRef.current = {};
      for (const [key, value] of Object.entries(body)) lastSyncedRef.current[key] = JSON.stringify(value);
      fetch('/api/user/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).catch(() => {});
    }, 1500);
  };

  useEffect(() => {
    try {
      setLiked(JSON.parse(localStorage.getItem('kax-liked') || '[]'));
      setFavArtists(JSON.parse(localStorage.getItem('sur-fav-artists') || '[]'));
      setDownloads(JSON.parse(localStorage.getItem('psf-downloads') || '[]'));
      setHistory(JSON.parse(localStorage.getItem('kax-history') || '[]'));
      setSearchHistory(JSON.parse(localStorage.getItem('sur-search-history') || '[]'));
      setProfile(JSON.parse(localStorage.getItem('sur-profile') || 'null'));
      setUser(JSON.parse(localStorage.getItem('sur-session') || 'null'));
    } catch {}

    // Verify session with server and load fresh cloud data from MongoDB
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(res => {
        if (res?.user) {
          setUser(res.user);
          try { localStorage.setItem('sur-session', JSON.stringify(res.user)); } catch {}
          if (res.data) {
            for (const key of ['liked', 'favArtists', 'downloads', 'history']) lastSyncedRef.current[key] = JSON.stringify(res.data[key] || []);
            if (res.data.profile) {
              setProfile(res.data.profile);
              try { localStorage.setItem('sur-profile', JSON.stringify(res.data.profile)); } catch {}
            }
            if (res.data.liked?.length) {
              setLiked(res.data.liked);
              try { localStorage.setItem('kax-liked', JSON.stringify(res.data.liked)); } catch {}
            }
            if (res.data.favArtists?.length) {
              setFavArtists(res.data.favArtists);
              try { localStorage.setItem('sur-fav-artists', JSON.stringify(res.data.favArtists)); } catch {}
            }
            if (res.data.downloads?.length) {
              setDownloads(res.data.downloads);
              try { localStorage.setItem('psf-downloads', JSON.stringify(res.data.downloads)); } catch {}
            }
            if (res.data.history?.length) {
              setHistory(res.data.history);
              try { localStorage.setItem('kax-history', JSON.stringify(res.data.history)); } catch {}
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const saveProfile = (next, sync = true) => {
    setProfile(next);
    setEditingTaste(false);
    try { localStorage.setItem('sur-profile', JSON.stringify(next)); } catch {}
    if (sync) syncUserData({ profile: next });
  };

  const artists = useMemo(() => profile?.artists?.length ? profile.artists : DEFAULT_ARTISTS, [profile]);
  const prefs = useMemo(() => ({ names: artists.map(a => a.name), languages: profile?.languages || [] }), [artists, profile]);

  useEffect(() => {
    try { localStorage.setItem('kax-liked', JSON.stringify(liked)); } catch {}
    if (ready) syncUserData({ liked });
  }, [liked, ready]);

  useEffect(() => {
    try { localStorage.setItem('sur-fav-artists', JSON.stringify(favArtists)); } catch {}
    if (ready) syncUserData({ favArtists });
  }, [favArtists, ready]);

  useEffect(() => {
    try { localStorage.setItem('psf-downloads', JSON.stringify(downloads)); } catch {}
    if (ready) syncUserData({ downloads });
  }, [downloads, ready]);

  useEffect(() => {
    try { localStorage.setItem('kax-history', JSON.stringify(history)); } catch {}
    if (ready) syncUserData({ history });
  }, [history, ready]);

  // Paged catalog, 10 items per page from JioSaavn. Fetched fresh on every visit, so new releases show up on their own.
  const loadMore = async (kind, artistId) => {
    const key = `${kind}:${artistId}`;
    const current = pages[key];
    if (loadingRef.current.has(key) || (current && current.items.length >= current.total)) return;
    loadingRef.current.add(key);
    const page = current ? current.page + 1 : 0;
    try {
      const path = { songs: 'songs?sortBy=popularity', latest: 'songs?sortBy=latest', albums: 'albums?sortBy=latest' }[kind];
      const data = await api(`/artists/${artistId}/${path}&page=${page}&sortOrder=desc`);
      const list = kind === 'albums' ? data.albums : data.songs;
      const items = kind === 'albums' ? list.map(mapAlbum) : list.map(mapSong).filter(item => item.url);
      setPages(all => {
        const prev = all[key]?.items || [];
        const seen = new Set(prev.map(item => item.id));
        // ponytail: if a page comes back empty, stop paging even if total says there is more
        const total = list.length ? data.total : prev.length;
        return { ...all, [key]: { items: [...prev, ...items.filter(item => !seen.has(item.id))], page, total } };
      });
    } catch {}
    loadingRef.current.delete(key);
  };

  useEffect(() => {
    artists.forEach(a => ['songs', 'latest', 'albums'].forEach(kind => !pages[`${kind}:${a.id}`] && loadMore(kind, a.id)));
  }, [artists]);

  // Artist song lists come without play counts; batch-fetch them for the newest songs to rank Trending.
  const newSongs = useMemo(() => {
    const seen = new Set();
    return interleave(artists.map(x => itemsOf('latest', x.id))).filter(item => !seen.has(item.id) && seen.add(item.id)).slice(0, 40);
  }, [pages, artists]);

  const fetchedStatsRef = useRef(new Set());
  useEffect(() => {
    const missing = newSongs.filter(item => !fetchedStatsRef.current.has(item.id)).map(item => item.id);
    if (!missing.length) return;
    const batch = missing.slice(0, 20);
    batch.forEach(id => fetchedStatsRef.current.add(id));
    api(`/songs?ids=${batch.join(',')}`)
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setStats(all => ({ ...all, ...Object.fromEntries(batch.map(id => [id, Number(list.find(item => item.id === id)?.playCount) || 0])) }));
      })
      .catch(() => {});
  }, [newSongs]);

  useEffect(() => {
    if (!currentTrack) return;
    let cancelled = false;
    setLyrics(null);
    fetchLyrics(currentTrack).then(result => !cancelled && setLyrics(result)).catch(() => !cancelled && setLyrics({ lines: [] }));
    return () => { cancelled = true; };
  }, [currentTrack?.song, currentTrack?.artist]);

  const currentTime = progress / 100 * duration;
  const activeLine = lyrics?.synced ? lyrics.lines.findLastIndex(line => line.t <= currentTime) : -1;

  useEffect(() => {
    const box = lyricsRef.current;
    const line = box?.children[activeLine];
    if (line) box.scrollTo({ top: line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2, behavior: 'smooth' });
  }, [activeLine]);

  // Clean in-app screen stack: never pops the browser window or reloads the app
  const go = next => {
    setSearchOpen(false);
    setStack(prev => prev.at(-1) === next ? prev : [...prev, next]);
  };

  const back = () => {
    if (searchOpen) {
      setSearchOpen(false);
      return;
    }
    setStack(prev => prev.length > 1 ? prev.slice(0, -1) : ['home']);
  };

  const closePlayer = event => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setStack(prev => {
      const next = prev.filter(v => v !== 'player');
      return next.length > 0 ? next : ['home'];
    });
  };

  const goHome = () => {
    setSearchOpen(false);
    setStack(prev => (prev.length === 1 && prev[0] === 'home') ? prev : ['home']);
  };

  function itemsOf(kind, artistId) { return pages[`${kind}:${artistId}`]?.items || []; }
  const totalOf = (kind, artistId) => pages[`${kind}:${artistId}`]?.total;
  const hasMore = (kind, artistId) => { const p = pages[`${kind}:${artistId}`]; return !p || p.items.length < p.total; };

  const topSongs = useMemo(() => interleave(artists.map(x => itemsOf('songs', x.id).slice(0, 10))).slice(0, 30), [pages, artists]);

  const latest = useMemo(() => {
    const seen = new Set();
    return artists.flatMap(x => itemsOf('albums', x.id))
      .filter(item => !seen.has(item.id) && seen.add(item.id))
      .sort((x, y) => (Number(y.year) - Number(x.year)) || (Number(y.id) - Number(x.id)));
  }, [pages, artists]);

  // Spotify-style shortcut grid: what you played, then liked, then new albums.
  const quickPicks = useMemo(() => {
    const seen = new Set();
    return [...history, ...liked, ...latest]
      .filter(item => item && !seen.has(item.song ? keyOf(item) : `a-${item.id}`) && seen.add(item.song ? keyOf(item) : `a-${item.id}`))
      .slice(0, 8);
  }, [history, liked, latest]);

  const trending = useMemo(() => newSongs.filter(item => item.id in stats).sort((a, b) => stats[b.id] - stats[a.id]).slice(0, 10), [newSongs, stats]);

  // Every song the app has seen is a candidate for recommendations and radio.
  const pool = useMemo(() => {
    const seen = new Set();
    return [...artists.flatMap(a => [...itemsOf('songs', a.id), ...itemsOf('latest', a.id)]), ...(album?.songs || []), ...results.songs, ...liked, ...history]
      .filter(item => item?.url && !seen.has(keyOf(item)) && seen.add(keyOf(item)))
      .map(item => item.id in stats ? { ...item, playCount: stats[item.id] } : item);
  }, [pages, artists, album, results, liked, history, stats]);

  // New listeners have no plays yet, so their chosen artists' top songs seed the mix.
  const seeds = useMemo(() => history.length ? history : liked.length ? liked : topSongs.slice(0, 3), [history, liked, topSongs]);
  const madeForYou = useMemo(() => seeds.length ? recommend(seeds, pool, 12, prefs) : [], [seeds, pool, prefs]);

  // Live search: debounced, cancels stale requests, caches every query.
  useEffect(() => {
    const q = norm(query);
    if (!searchOpen || !q) return;
    if (searchCache.current.has(q)) {
      setResults(searchCache.current.get(q));
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const found = await searchAll(q, prefs.names, controller.signal);
        searchCache.current.set(q, found);
        setResults(found);
      } catch (error) {
        if (error.name === 'AbortError') return;
        setResults({ songs: [], albums: [], artists: [] });
      }
      setSearching(false);
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, searchOpen]);

  const [loadingMoreSongs, setLoadingMoreSongs] = useState(false);
  const loadMoreSongs = async () => {
    const q = norm(query);
    setLoadingMoreSongs(true);
    try {
      const page = (results.page || 1) + 1;
      const next = await saavnSearch(q, undefined, page);
      const seen = new Set(results.songs.map(item => item.id));
      const fresh = next.filter(item => !seen.has(item.id));
      // Saavn-found songs replace their Apple-preview duplicates.
      const songs = [...results.songs.filter(item => item.source !== 'itunes' || !fresh.some(song => sameSong(song, item))), ...fresh];
      const found = { ...results, songs, page, more: next.length >= 20 && fresh.length > 0 };
      searchCache.current.set(q, found);
      setResults(found);
    } catch {}
    setLoadingMoreSongs(false);
  };

  const openSearch = (value = query) => {
    setQuery(value);
    if (searchOpen) return;
    setSearchOpen(true);
  };
  const closeSearch = () => {
    setSearchOpen(false);
  };

  const keysRef = useRef({});
  keysRef.current = { openSearch, closeSearch, searchOpen };
  useEffect(() => {
    const onKey = event => {
      const { openSearch: open, closeSearch: close, searchOpen: isOpen } = keysRef.current;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        isOpen ? close() : open();
      }
      if (event.key === 'Escape' && isOpen) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const q = norm(query);
  const artistHits = q ? [...artists.filter(a => norm(a.name).includes(q)), ...(results.artists || [])].filter((a, i, list) => list.findIndex(b => b.id === a.id) === i).slice(0, 6) : [];
  const showAll = searchTab === 'all';

  // Ad breaks: every N songs, one non-skippable ad. The counter lives in localStorage,
  // so refreshing or killing the app brings the pending ad straight back.
  const [adsConfig, setAdsConfig] = useState({ enabled: false, adTag: '', songsPerAd: 3, isAdmin: false });
  const [adBreak, setAdBreak] = useState(null);
  const adCountRef = useRef(0);
  const setAdCount = n => {
    adCountRef.current = n;
    try { localStorage.setItem('sur-ad-count', String(n)); } catch {}
  };
  useEffect(() => {
    try { adCountRef.current = Number(localStorage.getItem('sur-ad-count')) || 0; } catch {}
  }, []);
  useEffect(() => {
    fetch('/api/ads').then(res => res.ok ? res.json() : null).then(config => config && setAdsConfig(config)).catch(() => {});
  }, [user]);
  const adDue = adsConfig.enabled && adsConfig.adTag && adCountRef.current >= adsConfig.songsPerAd;
  // Owed an ad from before the refresh: show it before anything else plays.
  useEffect(() => {
    if (adDue && !adBreak) {
      audioRef.current?.pause();
      setAdBreak({ track: null });
    }
  }, [adsConfig]);
  const finishAd = played => {
    if (played) setAdCount(0);
    const pending = adBreak?.track;
    setAdBreak(null);
    // skipAd: a failed/no-fill ad lets this song through; the next song tries again.
    if (pending) streamTrack(pending, false, true);
  };
  const saveAds = async patch => {
    const res = await fetch('/api/ads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => null);
    const next = await res?.json().catch(() => null);
    if (res?.ok) setAdsConfig(next);
    else alert(next?.error || 'Could not save ad settings');
  };

  const streamTrack = async (track, isAutomixTransition = false, skipAd = false) => {
    if (!audioRef.current) return;
    if (!skipAd && adDue) {
      audioRef.current.pause();
      setIsPlaying(false);
      setAdBreak({ track });
      return;
    }
    setCurrentTrack(track);
    setStatus('Loading…');
    setIsPlaying(false);
    setProgress(0);
    try {
      let url = track.url || '';
      let preview = false;
      if (!url) {
        const hit = (await saavnSearch(`${track.song} ${track.artist}`)).find(item => sameTitle(item.song, track.song));
        if (hit) {
          url = hit.url;
          track = { ...track, ...hit };
        }
      }
      if (!url) {
        const hit = await itunesPreview(track);
        if (hit) {
          url = hit.previewUrl;
          preview = true;
          track = { ...track, img: track.img || hit.artworkUrl100?.replace('100x100', '500x500') };
        }
      }
      if (!url) throw new Error('No stream');
      streamRef.current = url;
      setCurrentTrack(track);
      audioRef.current.src = url;
      if (automix && isAutomixTransition) {
        audioRef.current.volume = 0.2;
      } else {
        audioRef.current.volume = 1;
      }
      audioRef.current.load();
      await audioRef.current.play();
      setStatus(preview ? '30s preview · full song not on JioSaavn' : '');
      setAdCount(adCountRef.current + 1);
      const played = track;
      setHistory(items => [played, ...items.filter(item => keyOf(item) !== keyOf(played))].slice(0, 50));
      try { trackEvent('play_song', { song: track.song, artist: track.artist, automix }); } catch {}
    } catch {
      setStatus('Could not load this stream. Try another song.');
    }
  };

  // With a list (album, Play button, liked) songs play in order. Without one it's radio: each next song is the most similar.
  // Browsing is open to everyone; playing needs an account. After signing up, the song they picked starts.
  const requireAuth = action => user ? action() : setAuth({ mode: 'signup', then: action });
  const playTrack = (track, list) => requireAuth(() => {
    if (query?.trim()) addSearchQuery(query.trim());
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    window.scrollTo(0, 0);
    go('player');
    startTrack(track, list);
  });
  const startTrack = (track, list) => {
    const index = list ? list.findIndex(item => keyOf(item) === keyOf(track)) : 0;
    setQueueMode(list ? 'list' : 'radio');
    setQueue(list || [track]);
    setQueueIndex(index < 0 ? 0 : index);
    setHistory(items => [track, ...items.filter(item => keyOf(item) !== keyOf(track))].slice(0, 50));
    streamTrack(track);
  };

  const upNext = useMemo(() => {
    if (!currentTrack || !queue.length) return null;
    if (queueMode === 'list') return queue[(queueIndex + 1 + (shuffle && queue.length > 1 ? Math.floor(Math.random() * (queue.length - 1)) : 0)) % queue.length];
    return queue[queueIndex + 1] || pickSimilar(currentTrack, pool, played([...queue, ...history.slice(0, 20)]), prefs);
  }, [currentTrack, queue, queueIndex, queueMode, shuffle, pool, history, prefs]);

  // Spotify-style cover swipe: art follows the finger, past the threshold it flies off and the song changes.
  const swipeRef = useRef(null);
  const swipeResetRef = useRef(null);
  const [swipe, setSwipe] = useState({ x: 0, anim: false, dir: 0 });
  const onArtDown = e => { swipeRef.current = { x0: e.clientX, y0: e.clientY, t: Date.now(), active: false }; };
  const onArtMove = e => {
    const drag = swipeRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.active) {
      if (Math.abs(dx) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { swipeRef.current = null; return; }
      drag.active = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setSwipe({ x: dx, anim: false, dir: 0 });
  };
  const onArtUp = e => {
    const drag = swipeRef.current;
    swipeRef.current = null;
    if (!drag?.active) return;
    const dx = e.clientX - drag.x0;
    const flick = Math.abs(dx) / Math.max(1, Date.now() - drag.t) > 0.5 && Math.abs(dx) > 30;
    if (Math.abs(dx) < 90 && !flick) return setSwipe({ x: 0, anim: true, dir: 0 });
    const dir = dx < 0 ? 1 : -1;
    setSwipe({ x: -dir * window.innerWidth, anim: true, dir });
    setTimeout(() => step(dir), 200);
    // No next/previous song: spring back instead of leaving the art off-screen.
    clearTimeout(swipeResetRef.current);
    swipeResetRef.current = setTimeout(() => setSwipe({ x: 0, anim: true, dir: 0 }), 1500);
  };
  useEffect(() => {
    clearTimeout(swipeResetRef.current);
    setSwipe(current => ({ x: 0, anim: false, dir: current.dir }));
  }, [currentTrack?.id]);

  const step = (delta, isAutomixTransition = false) => {
    if (!queue.length) return;
    if (queueMode === 'list') {
      const index = shuffle && delta > 0 ? queue.indexOf(upNext) : (queueIndex + delta + queue.length) % queue.length;
      setQueueIndex(index);
      streamTrack(queue[index], isAutomixTransition);
      return;
    }
    const index = queueIndex + delta;
    if (index < 0) return;
    if (index >= queue.length) {
      if (!upNext) return;
      setQueue(items => [...items, upNext]);
    }
    setQueueIndex(index);
    streamTrack(queue[index] || upNext, isAutomixTransition);
  };

  const togglePlay = async () => {
    if (!audioRef.current || !currentTrack || adBreak) return;
    if (audioRef.current.paused) {
      try { await audioRef.current.play(); } catch {}
    } else {
      audioRef.current.pause();
    }
  };

  stepRef.current = step;
  togglePlayRef.current = togglePlay;
  seekToRef.current = (seconds) => {
    if (audioRef.current && seconds != null) {
      audioRef.current.currentTime = seconds;
      updateMediaPosition(seconds, audioRef.current.duration);
    }
  };

  const toggleAutomix = () => {
    setAutomix(prev => {
      const next = !prev;
      try { localStorage.setItem('sur-automix', String(next)); } catch {}
      try { trackEvent('automix_toggle', { enabled: next }); } catch {}
      return next;
    });
  };

  const changeCrossfade = sec => {
    setCrossfadeSec(sec);
    try { localStorage.setItem('sur-crossfade', String(sec)); } catch {}
  };

  // Browser Tab Title & Dynamic Favicon
  // Default: Title "Sur", Favicon "/icon.svg"
  // When Music is Playing: Title "${song} - ${artist}", Favicon "${coverArt}"
  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (currentTrack && isPlaying) {
      document.title = `${currentTrack.song} - ${currentTrack.artist}`;
      updateFavicon(currentTrack.img || '/icon.png');
    } else {
      document.title = 'Sur';
      updateFavicon('/icon.png');
    }
  }, [currentTrack, isPlaying]);

  // Lock Screen & Control Center metadata (MediaSession API)
  // Fixes: iOS lock screen widget now shows actual Song Title, Artist Name, Album, and full Cover Art
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }

    let artworkUrl = currentTrack.img || '';
    if (artworkUrl && !artworkUrl.startsWith('http://') && !artworkUrl.startsWith('https://')) {
      artworkUrl = `${window.location.origin}${artworkUrl.startsWith('/') ? '' : '/'}${artworkUrl}`;
    }
    const highResArtwork = artworkUrl.replace('150x150', '500x500');

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.song || 'Unknown Song',
        artist: currentTrack.artist || 'Sur Music',
        album: currentTrack.album || 'Sur',
        artwork: artworkUrl ? [
          { src: artworkUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: artworkUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: highResArtwork, sizes: '256x256', type: 'image/jpeg' },
          { src: highResArtwork, sizes: '384x384', type: 'image/jpeg' },
          { src: highResArtwork, sizes: '500x500', type: 'image/jpeg' },
          { src: highResArtwork, sizes: '512x512', type: 'image/jpeg' }
        ] : [
          { src: `${window.location.origin}/icon.png`, sizes: '512x512', type: 'image/png' }
        ]
      });
    } catch (e) {
      console.warn('Failed to set MediaSession metadata', e);
    }
  }, [currentTrack]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {}
  }, [isPlaying]);

  const updateMediaPosition = (cur, dur) => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;
    if (dur && !isNaN(dur) && dur > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, dur),
          playbackRate: audioRef.current?.playbackRate || 1,
          position: Math.min(Math.max(0, cur || 0), dur)
        });
      } catch {}
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

    try { navigator.mediaSession.setActionHandler('play', () => togglePlayRef.current?.()); } catch {}
    try { navigator.mediaSession.setActionHandler('pause', () => togglePlayRef.current?.()); } catch {}
    try { navigator.mediaSession.setActionHandler('previoustrack', () => stepRef.current?.(-1)); } catch {}
    try { navigator.mediaSession.setActionHandler('nexttrack', () => stepRef.current?.(1)); } catch {}
    try {
      navigator.mediaSession.setActionHandler('seekto', details => {
        if (details.seekTime != null) seekToRef.current?.(details.seekTime);
      });
    } catch {}
    try {
      navigator.mediaSession.setActionHandler('seekbackward', details => {
        const skip = details.seekOffset || 10;
        if (audioRef.current) seekToRef.current?.(Math.max(0, audioRef.current.currentTime - skip));
      });
    } catch {}
    try {
      navigator.mediaSession.setActionHandler('seekforward', details => {
        const skip = details.seekOffset || 10;
        if (audioRef.current) seekToRef.current?.(Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + skip));
      });
    } catch {}

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekto', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
      } catch {}
    };
  }, []);

  const handleTimeUpdate = event => {
    const audio = event.currentTarget;
    if (!audio.duration) return;
    const cur = audio.currentTime;
    const dur = audio.duration;
    setProgress((cur / dur) * 100);
    updateMediaPosition(cur, dur);

    // Pre-resolve upNext track URL 15s before track ends so automix crossfade transition is instant
    if (automix && upNext && !upNext.url && dur - cur < 15 && !prefetchingRef.current) {
      prefetchingRef.current = true;
      (async () => {
        try {
          const hit = (await saavnSearch(`${upNext.song} ${upNext.artist}`)).find(item => sameTitle(item.song, upNext.song));
          if (hit?.url) {
            upNext.url = hit.url;
            if (hit.img && !upNext.img) upNext.img = hit.img;
          }
        } catch {}
        prefetchingRef.current = false;
      })();
    }

    // Automix: smart crossfade
    if (automix && dur > 20) {
      const timeLeft = dur - cur;
      if (timeLeft <= crossfadeSec && timeLeft > 0) {
        setIsMixing(true);
        // Smoothly fade down outgoing volume
        const fadeRatio = Math.max(0.08, timeLeft / crossfadeSec);
        audio.volume = Math.min(1, Math.max(0, fadeRatio));

        // When reached within 0.8s of crossfade window, trigger seamless transition to next track
        if (timeLeft <= 0.8 && !transitioningRef.current) {
          transitioningRef.current = true;
          step(1, true);
          setTimeout(() => { transitioningRef.current = false; }, 2000);
        }
      } else {
        if (isMixing) setIsMixing(false);
        // Smooth volume fade-in when starting a track
        if (cur < 2) {
          const fadeInRatio = Math.min(1, Math.max(0.2, cur / 2));
          audio.volume = fadeInRatio;
        } else {
          audio.volume = 1;
        }
      }
    } else {
      if (isMixing) setIsMixing(false);
      audio.volume = 1;
    }
  };

  const isLiked = currentTrack && liked.some(item => keyOf(item) === keyOf(currentTrack));

  const toggleLike = () => {
    if (!currentTrack) return;
    const { song, artist: by, img, id, url, album: albumName } = currentTrack;
    setLiked(items => isLiked ? items.filter(item => keyOf(item) !== keyOf(currentTrack)) : [{ song, artist: by, img, id, url, album: albumName }, ...items]);
    try { trackEvent('like_song', { song, artist: by }); } catch {}
  };

  const downloadCurrent = async event => {
    // Keep the player mounted while the browser handles the download.
    event?.preventDefault();
    event?.stopPropagation();
    if (!streamRef.current || !currentTrack) return;

    const filename = `${currentTrack.song}.mp3`;
    try {
      // Download a local blob so a cross-origin audio URL cannot replace the app.
      const response = await fetch(streamRef.current);
      if (!response.ok) throw new Error('Download failed');
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      try { trackEvent('download_song', { song: currentTrack.song, artist: currentTrack.artist }); } catch {}
    } catch {
      // Never navigate to a mirror URL: a blocked download must not close the player.
      setStatus('Download unavailable for this song.');
      return;
    }
    const entry = { song: currentTrack.song, artist: currentTrack.artist, img: currentTrack.img || '', id: currentTrack.id, url: currentTrack.url, date: Date.now() };
    setDownloads(items => [entry, ...items.filter(item => keyOf(item) !== keyOf(entry))]);
  };

  const toggleLikeTrack = track => {
    if (!track) return;
    const exists = liked.some(item => keyOf(item) === keyOf(track));
    const { song, artist: by, img, id, url, album: albumName } = track;
    setLiked(items => exists ? items.filter(item => keyOf(item) !== keyOf(track)) : [{ song, artist: by, img, id, url, album: albumName }, ...items]);
    try { trackEvent('like_song', { song, artist: by }); } catch {}
  };

  const downloadTrack = async (track, event) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (!track) return;
    const trackUrl = track.url || (currentTrack && keyOf(currentTrack) === keyOf(track) ? streamRef.current : '');
    if (!trackUrl) {
      playTrack(track);
      return;
    }
    const filename = `${track.song}.mp3`;
    try {
      const response = await fetch(trackUrl);
      if (!response.ok) throw new Error('Download failed');
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      try { trackEvent('download_song', { song: track.song, artist: track.artist }); } catch {}
    } catch {
      window.open(trackUrl, '_blank');
    }
    const entry = { song: track.song, artist: track.artist, img: track.img || '', id: track.id, url: track.url, date: Date.now() };
    setDownloads(items => [entry, ...items.filter(item => keyOf(item) !== keyOf(entry))]);
  };

  const seek = event => {
    const value = Number(event.target.value);
    setProgress(value);
    if (audioRef.current?.duration) {
      const newTime = value / 100 * audioRef.current.duration;
      audioRef.current.currentTime = newTime;
      updateMediaPosition(newTime, audioRef.current.duration);
    }
  };

  const seekTo = seconds => {
    if (audioRef.current && seconds != null) {
      audioRef.current.currentTime = seconds;
      updateMediaPosition(seconds, audioRef.current.duration);
    }
  };

  const finishAuth = (account, cloudData) => {
    setUser(account);
    try { localStorage.setItem('sur-session', JSON.stringify(account)); } catch {}
    if (cloudData) {
      if (cloudData.profile) saveProfile(cloudData.profile, false);
      if (cloudData.liked?.length) setLiked(cloudData.liked);
      if (cloudData.favArtists?.length) setFavArtists(cloudData.favArtists);
      if (cloudData.downloads?.length) setDownloads(cloudData.downloads);
      if (cloudData.history?.length) setHistory(cloudData.history);
    } else if (profile && !profile.name) {
      saveProfile({ ...profile, name: account.name });
    }
    const then = auth?.then;
    setAuth(null);
    then?.();
  };

  const signOut = () => {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    audioRef.current?.pause();
    setCurrentTrack(null);
    setUser(null);
    try { localStorage.removeItem('sur-session'); } catch {}
  };

  const tiles = [
    { id: 'foryou', title: 'Made For You', songs: madeForYou },
    { id: 'new', title: 'New Releases', songs: newSongs },
    { id: 'trending', title: 'Trending', songs: trending },
    { id: 'charts', title: 'Charts', chart: CHARTS_ID },
    ...[...LANGUAGES].sort((a, b) => prefs.languages.includes(b.id) - prefs.languages.includes(a.id)).map(l => ({ id: l.id, title: l.label, chart: l.chart }))
  ].map((tile, i) => ({ ...tile, color: TILE_COLORS[i % TILE_COLORS.length], img: tile.songs?.[0]?.img || tileArt[tile.chart] }));

  useEffect(() => {
    if (view !== 'search') return;
    tiles.filter(tile => tile.chart && !(tile.chart in tileArt)).forEach(tile => {
      setTileArt(all => ({ ...all, [tile.chart]: '' }));
      api(`/playlists?id=${tile.chart}&limit=1`).then(data => setTileArt(all => ({ ...all, [tile.chart]: data.image?.at(-1)?.url || '' }))).catch(() => {});
    });
  }, [view]);

  const openCollection = async tile => {
    setCollection({ ...tile, songs: tile.songs || null });
    go('collection');
    if (!tile.chart) return;
    try {
      const data = await api(`/playlists?id=${tile.chart}&limit=50`);
      setCollection(current => current?.id === tile.id ? { ...current, title: decode(data.name) || tile.title, songs: data.songs.map(mapSong).filter(item => item.url) } : current);
    } catch {
      setCollection(current => current?.id === tile.id ? { ...current, songs: [] } : current);
    }
  };

  const libraryViews = ['library', 'history', 'artists', 'albums', 'artist', 'album', 'song', 'liked', 'favArtists', 'downloads', 'settings'];
  const tab = view === 'collection' ? 'search' : libraryViews.includes(view) ? 'library' : view;
  const goTab = target => target === 'home' ? goHome() : go(target);
  const initial = (user?.name || profile?.name || '?').trim().charAt(0).toUpperCase();

  const openArtist = a => {
    setArtist(a);
    go('artist');
    ['songs', 'albums'].forEach(kind => !pages[`${kind}:${a.id}`] && loadMore(kind, a.id));
  };

  const isFav = a => a && favArtists.some(x => x.id === a.id);
  const toggleFavArtist = ({ id, name, img }) =>
    setFavArtists(items => items.some(x => x.id === id) ? items.filter(x => x.id !== id) : [{ id, name, img }, ...items]);

  const openAlbum = async a => {
    setAlbum({ ...a, songs: null });
    go('album');
    try {
      const data = await api(`/albums?id=${a.id}`);
      const songs = (data?.songs || []).map(mapSong).filter(item => item.url);
      const artist = decode(data?.artists?.primary?.map(x => x.name).join(', ')) || a.artist;
      const artistImg = data?.artists?.primary?.[0]?.image?.at(-1)?.url || a.artistImg || '';
      setAlbum(current => current?.id === a.id ? {
        ...current,
        ...data,
        name: decode(data?.name) || current.name,
        artist,
        artistImg,
        img: data?.image?.at(-1)?.url || current.img,
        year: data?.year || current.year,
        songCount: data?.songCount || songs.length,
        songs
      } : current);
    } catch {
      setAlbum(current => current?.id === a.id ? { ...current, songs: [] } : current);
    }
  };

  const openSong = async s => {
    setSelectedSong(s);
    go('song');
    if (s.albumId) {
      try {
        const data = await api(`/albums?id=${s.albumId}`);
        const songs = (data?.songs || []).map(mapSong).filter(item => item.url);
        setSelectedSong(current => current?.id === s.id ? {
          ...current,
          albumSongs: songs,
          artistImg: data?.artists?.primary?.[0]?.image?.at(-1)?.url || current.artistImg,
          year: data?.year || current.year
        } : current);
      } catch {}
    }
  };

  const isCurrent = track => currentTrack && keyOf(currentTrack) === keyOf(track);
  const elapsed = fmt(currentTime);
  const allSongsCount = artists.reduce((sum, a) => sum + (totalOf('songs', a.id) || 0), 0);
  const allAlbumsCount = artists.reduce((sum, a) => sum + (totalOf('albums', a.id) || 0), 0);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const tasteSummary = `${prefs.languages.length ? plural(prefs.languages.length, 'language') : 'Any language'} · ${plural(artists.length, 'artist')}`;
  const libraryItems = [
    ['Recently Played', `${history.length} Songs`, 'disc', 'history'],
    ['All Songs', `${allSongsCount} Songs`, 'disc', 'artists'],
    ['Albums', `${allAlbumsCount} Albums`, 'album', 'albums'],
    ['Liked Songs', `${liked.length} Songs`, 'heart', 'liked'],
    ['Favorite Artists', `${favArtists.length} Artists`, 'user', 'favArtists'],
    ['Downloads', `${downloads.length} Songs`, 'download', 'downloads'],
    ['Settings', user ? user.email : 'Account & audio preferences', 'settings', 'settings'],
    ['Your taste', tasteSummary, 'user', 'taste']
  ];
  const openItem = target => target === 'taste' ? setEditingTaste(true) : go(target);
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const suggestions = artists.slice(0, 6).map(a => a.name);
  const artistSongs = itemsOf('songs', artist.id);
  const artistAlbums = itemsOf('albums', artist.id);
  const loadMoreButton = (kind, artistId, label) => hasMore(kind, artistId) && <button className="loadMore" onClick={() => loadMore(kind, artistId)}>{label}</button>;

  return (
    <main className="stage">
      <div className={`phone ${isPlaying ? 'playing' : ''}`}>
        <header className="topBar">
          <Brand />
          <button className={`homeCircle ${tab === 'home' ? 'active' : ''}`} onClick={goHome} aria-label="Home"><Icon name="home" /></button>
          <button className="search topSearch" onClick={() => openSearch()}>
            <kbd>⌘K</kbd>
            <span className="searchText">What do you want to play?</span>
            <Icon name="search" />
          </button>
          <div className="topActions">
            {user ? <button className="avatarBtn" onClick={() => go('settings')} aria-label="Account settings">{initial}</button> : <>
              <button className="signupLink" onClick={() => setAuth({ mode: 'signup' })}>Sign up</button>
              <button className="loginBtn big" onClick={() => setAuth({ mode: 'login' })}>Log in</button>
            </>}
          </div>
        </header>

        <aside className="side">
          <nav className="sideNav">
            <button className={tab === 'home' ? 'active' : ''} onClick={goHome}><Icon name="home" />Home</button>
            <button className={tab === 'search' ? 'active' : ''} onClick={() => go('search')}><Icon name="search" />Search<kbd>⌘K</kbd></button>
            <button className={tab === 'settings' ? 'active' : ''} onClick={() => go('settings')}><Icon name="settings" />Settings</button>
          </nav>
          <div className="sideBox">
            <h3>Your Library</h3>
            {libraryItems.map(([title, sub, icon, target]) => <button className={`sideItem ${view === target ? 'active' : ''}`} key={title} onClick={() => openItem(target)}>
              <span className="menuIcon small"><Icon name={icon} size={18} /></span>
              <span className="rowText"><strong>{title}</strong><small>{sub}</small></span>
            </button>)}
            <h3>Artists</h3>
            {artists.map(a => <button className={`sideItem ${view === 'artist' && artist.id === a.id ? 'active' : ''}`} key={a.id} onClick={() => openArtist(a)}>
              <img src={a.img} alt="" />
              <span className="rowText"><strong>{a.name}</strong><small>{totalOf('songs', a.id) || '…'} songs</small></span>
            </button>)}
          </div>
        </aside>

        <div className="scroll" ref={scrollRef}>
          {view === 'home' && <div className="homeWrapper" key="home">
            <section className="homeTop">
              <div className="homeBar">
                <Brand />
                <div className="homeBarRight">
                  {user ? <button className="avatarBtn" onClick={() => go('settings')} aria-label="Account settings">{initial}</button>
                    : <button className="loginBtn" onClick={() => setAuth({ mode: 'login' })}>Log in</button>}
                </div>
              </div>
            </section>

            <section className="sheet">
                <h1 className="homeTitle">{greeting}{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}</h1>
                <div className="quickGrid">
                  {quickPicks.map(item => !item.song
                    ? <button className="quickTile" key={`a-${item.id}`} onClick={() => openAlbum(item)}>
                        <img src={item.img} alt="" loading="lazy" /><strong>{item.name}</strong>
                      </button>
                    : <button className={`quickTile ${isCurrent(item) ? 'active' : ''}`} key={keyOf(item)} onClick={() => playTrack(item, quickPicks.filter(x => x.song))}>
                        <img src={item.img} alt="" loading="lazy" /><strong>{item.song}</strong>
                        <span className="quickPlay"><Icon name={isCurrent(item) && isPlaying ? 'pause' : 'play'} fill size={16} /></span>
                      </button>)}
                  {!quickPicks.length && Array.from({ length: 6 }).map((_, i) => <div key={i} className="quickTile shimmer" aria-hidden="true" />)}
                </div>
                {history.length > 0 && <>
                  <div className="sectionHead"><h2>Recently played</h2><button onClick={() => go('history')}>Show all</button></div>
                  <div className="albums scrollRow">
                    {history.slice(0, 10).map(item => <button className="album" key={keyOf(item)} onClick={() => playTrack(item, history)}>
                      <img src={item.img} alt="" loading="lazy" />
                      <strong>{item.song}</strong>
                      <small>{item.artist}</small>
                    </button>)}
                  </div>
                </>}

                {upcoming.length > 0 && <>
                  <div className="sectionHead"><h2>Upcoming</h2></div>
                  <div className="albums scrollRow">
                    {upcoming.map(item => <div className="album" key={item.name}>
                      <img src={item.img} alt="" />
                      <strong>{item.name}</strong>
                      <small>{item.artist} · {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</small>
                    </div>)}
                  </div>
                </>}

                <div className="sectionHead"><h2>New songs</h2><span>Newest first</span></div>
                <div className="albums scrollRow">
                  {newSongs.map(item => <button className="album" key={item.id} onClick={() => playTrack(item)}>
                    <span className="cover"><img src={item.img} alt="" loading="lazy" />{Number(item.year) >= new Date().getFullYear() && <em className="badge">NEW</em>}</span>
                    <strong>{item.song}</strong>
                    <small>{item.artist}</small>
                  </button>)}
                  {!newSongs.length && <ShimmerCards count={7} />}
                </div>

                {trending.length > 0 && <>
                  <div className="sectionHead"><h2>Trending now</h2><span>Most played new songs</span></div>
                  <div className="list">
                    {trending.map((item, index) => <TrackRow key={item.id} track={item} index={index + 1} active={isCurrent(item)} sub={item.artist} right={`${compact.format(stats[item.id])} plays`} onPlay={() => playTrack(item)} />)}
                  </div>
                </>}

                {madeForYou.length > 0 && <>
                  <div className="sectionHead"><h2>Made for you</h2><span>Based on {history.length ? 'what you play' : liked.length ? 'your likes' : 'your artists'}</span></div>
                  <div className="albums scrollRow">
                    {madeForYou.map(item => <button className="album" key={item.id} onClick={() => playTrack(item)}>
                      <img src={item.img} alt="" loading="lazy" />
                      <strong>{item.song}</strong>
                      <small>{item.artist}</small>
                    </button>)}
                  </div>
                </>}

                <div className="sectionHead"><h2>Latest releases</h2><button onClick={() => go('albums')}>Show all</button></div>
                <div className="albums scrollRow">
                  {latest.slice(0, 12).map(item => <AlbumCard key={item.id} album={item} onOpen={openAlbum} />)}
                  {!latest.length && <ShimmerCards count={7} />}
                </div>

                {favArtists.length > 0 && <>
                  <div className="sectionHead"><h2>Your favorite artists</h2><button onClick={() => go('favArtists')}>Show all</button></div>
                  <div className="artistsRow">
                    {favArtists.map(a => <button className="artistCard" key={a.id} onClick={() => openArtist(a)}>
                      <img src={a.img} alt="" />
                      <strong>{a.name}</strong>
                    </button>)}
                  </div>
                </>}

                <div className="sectionHead"><h2>Artists</h2></div>
                <div className="artistsRow">
                  {artists.map(a => <button className="artistCard" key={a.id} onClick={() => openArtist(a)}>
                    <img src={a.img} alt="" />
                    <strong>{a.name}</strong>
                    <small>{totalOf('songs', a.id) || '…'} songs · {totalOf('albums', a.id) || '…'} albums</small>
                  </button>)}
                </div>

                <div className="sectionHead"><h2>Top songs</h2><button onClick={() => go('artists')}>Show all</button></div>
                <div className="list">
                  {topSongs.map(item => <TrackRow key={item.id} track={item} active={isCurrent(item)} sub={`${item.artist} · ${item.album}`} right={item.year} onPlay={() => playTrack(item)} />)}
                  {!topSongs.length && <ShimmerTrackRows count={6} />}
                </div>
            </section>
          </div>}

          {view === 'search' && <section key="search" className="page">
            <Header title="Search" onBack={back} />
            <div className="searchSticky">
              <button className="searchPill" onClick={() => openSearch('')}>
                <Icon name="search" size={22} />
                <span>What do you want to listen to?</span>
              </button>
            </div>
            <div className="padX">
              <div className="sectionHead browseHead"><h2>Browse all</h2></div>
              <div className="tiles">
                {tiles.map(tile => <button className="tile" key={tile.id} style={{ '--tile': tile.color }} onClick={() => openCollection(tile)}>
                  <strong>{tile.title}</strong>
                  {tile.img && <img src={tile.img} alt="" loading="lazy" />}
                </button>)}
              </div>
            </div>
          </section>}

          {view === 'collection' && collection && <section key={`collection-${collection.id || collection.title}`} className="page">
            <div className="collectionHero" style={{ '--tile': collection.color }}>
              <div className="headerBar">
                <button className="iconBtn" onClick={back} aria-label="Back"><Icon name="back" /></button>
              </div>
              <div className="artistHero">
                {collection.img && <img className="square" src={collection.img} alt="" />}
                <div>
                  <small className="eyebrow">{collection.chart ? 'Chart' : 'Collection'}</small>
                  <h1>{collection.title}</h1>
                  <p>{collection.songs ? `${collection.songs.length} songs` : 'Loading…'}</p>
                  <button className="playAll" onClick={() => collection.songs?.[0] && playTrack(collection.songs[0], collection.songs)}><Icon name="play" fill size={16} />Play</button>
                </div>
              </div>
            </div>
            <div className="tracks">
              <div className="list plain">
                {!collection.songs && <ShimmerTrackRows count={8} />}
                {collection.songs?.length === 0 && <div className="empty">{collection.id === 'foryou' ? 'Play a few songs and your mix appears here.' : 'Nothing here yet.'}</div>}
                {collection.songs?.map((item, index) => <TrackRow key={item.id} track={item} index={index + 1} active={isCurrent(item)} onPlay={() => playTrack(item, collection.songs)} />)}
              </div>
            </div>
          </section>}

          {view === 'settings' && <section key="settings" className="page">
            <Header title="Settings" onBack={back} />
            <div className="padX">
              <div className="accountCard">
                <span className="avatarBtn big">{user ? initial : <Icon name="user" />}</span>
                <div className="rowText">
                  <strong>{user ? user.name : 'Not logged in'}</strong>
                  <small>{user ? user.email : 'Log in or sign up to play songs'}</small>
                </div>
                {!user && <div className="accountActions">
                  <button className="loginBtn ghost" onClick={() => setAuth({ mode: 'login' })}>Log in</button>
                  <button className="loginBtn" onClick={() => setAuth({ mode: 'signup' })}>Sign up</button>
                </div>}
              </div>
              <div className="menu flush">
                <div className="menuItem staticItem">
                  <span className={`menuIcon ${automix ? 'accentGrad' : ''}`}><Icon name="automix" /></span>
                  <div className="rowText">
                    <strong>Automix (Smart Transitions)</strong>
                    <small>Crossfades songs seamlessly with zero silence</small>
                  </div>
                  <button
                    type="button"
                    className={`toggleSwitch ${automix ? 'on' : ''}`}
                    onClick={toggleAutomix}
                    role="switch"
                    aria-checked={automix}
                    aria-label="Toggle Automix"
                  >
                    <span className="toggleHandle" />
                  </button>
                </div>
                {automix && (
                  <div className="crossfadeSettings">
                    <div className="crossfadeHeader">
                      <span>Crossfade duration</span>
                      <strong>{crossfadeSec}s</strong>
                    </div>
                    <div className="crossfadeButtons">
                      {[3, 5, 6, 8, 10, 12].map(s => (
                        <button
                          key={s}
                          type="button"
                          className={`crossfadeBtn ${crossfadeSec === s ? 'active' : ''}`}
                          onClick={() => changeCrossfade(s)}
                        >
                          {s}s
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button className="menuItem" onClick={() => setEditingTaste(true)}>
                  <span className="menuIcon"><Icon name="user" /></span>
                  <span className="rowText"><strong>Your taste</strong><small>{tasteSummary}</small></span>
                  <Icon name="right" size={18} />
                </button>
                <button className="menuItem" onClick={() => setHistory([])} disabled={!history.length}>
                  <span className="menuIcon"><Icon name="trash" /></span>
                  <span className="rowText"><strong>Clear listening history</strong><small>{history.length} songs · resets Made For You</small></span>
                </button>
                <button className="menuItem" onClick={() => setDownloads([])} disabled={!downloads.length}>
                  <span className="menuIcon"><Icon name="download" /></span>
                  <span className="rowText"><strong>Clear downloads list</strong><small>{downloads.length} songs</small></span>
                </button>
                {adsConfig.isAdmin && <div className="menuItem staticItem">
                  <span className={`menuIcon ${adsConfig.enabled ? 'accentGrad' : ''}`}><Icon name="disc" /></span>
                  <div className="rowText">
                    <strong>Ads (owner)</strong>
                    <small>{adsConfig.enabled ? `On for everyone · 1 ad every ${adsConfig.songsPerAd} songs` : 'Off for everyone'}</small>
                  </div>
                  <button type="button" className={`toggleSwitch ${adsConfig.enabled ? 'on' : ''}`} onClick={() => saveAds({ enabled: !adsConfig.enabled })} role="switch" aria-checked={adsConfig.enabled} aria-label="Toggle ads">
                    <span className="toggleHandle" />
                  </button>
                </div>}
                {adsConfig.isAdmin && <form className="adTagForm" onSubmit={e => { e.preventDefault(); saveAds({ adTag: e.currentTarget.adTag.value }); }}>
                  <label htmlFor="adTag">Ad Manager VAST tag URL <small>(empty = Google test ad)</small></label>
                  <div>
                    <input id="adTag" name="adTag" defaultValue={adsConfig.adTag} key={adsConfig.adTag} placeholder="https://pubads.g.doubleclick.net/gampad/ads?..." />
                    <button type="submit" className="loginBtn">Save</button>
                  </div>
                </form>}
                {user && <button className="menuItem" onClick={signOut}>
                  <span className="menuIcon danger"><Icon name="logout" /></span>
                  <span className="rowText"><strong>Log out</strong><small>Signed in as {user.email}</small></span>
                </button>}
              </div>
            </div>
          </section>}

          {view === 'library' && <section key="library" className="page">
            <Header title="My Library" onBack={back} />
            <div className="menu">
              {libraryItems.map(([title, sub, icon, target]) => <button className="menuItem" key={title} onClick={() => openItem(target)}>
                <span className="menuIcon"><Icon name={icon} /></span>
                <span className="rowText"><strong>{title}</strong><small>{sub}</small></span>
                <Icon name="right" size={18} />
              </button>)}
            </div>
          </section>}

          {view === 'artists' && <section key="artists" className="page">
            <Header title="All Songs" onBack={back} />
            <div className="folders">
              {artists.map(a => <button className="folder" key={a.id} onClick={() => openArtist(a)}>
                <span className="folderShape" />
                <strong>{a.name}</strong>
                <small>{totalOf('songs', a.id) || '…'} songs</small>
              </button>)}
            </div>
          </section>}

          {view === 'albums' && <section key="albums" className="page">
            <Header title="All Albums" onBack={back} />
            {artists.map(a => <div className="padX" key={a.id}>
              <div className="sectionHead"><h2>{a.name}</h2><span>{totalOf('albums', a.id) || '…'} albums</span></div>
              <div className="albums">
                {itemsOf('albums', a.id).map(item => <AlbumCard key={item.id} album={item} onOpen={openAlbum} />)}
              </div>
              {loadMoreButton('albums', a.id, `More ${a.name} albums`)}
            </div>)}
          </section>}

          {view === 'artist' && <section key={`artist-${artist?.id || 'curr'}`} className="page">
            <Header onBack={back} />
            <div className="artistHero">
              <img src={artist.img} alt="" />
              <div>
                <h1>{artist.name}</h1>
                <p>{totalOf('songs', artist.id) || '…'} songs · {totalOf('albums', artist.id) || '…'} albums</p>
                <div className="artistActions">
                  <button className="playAll" onClick={() => artistSongs[0] && playTrack(artistSongs[0], artistSongs)}><Icon name="play" fill size={16} />Play</button>
                  {artist.id && <button className={`followBtn ${isFav(artist) ? 'on' : ''}`} onClick={() => toggleFavArtist(artist)} aria-pressed={isFav(artist)}>{isFav(artist) ? 'Following' : 'Follow'}</button>}
                </div>
              </div>
            </div>
            <div className="padX">
              <div className="sectionHead"><h2>Albums</h2><span>Newest first</span></div>
              <div className="albums scrollRow">
                {artistAlbums.map(item => <AlbumCard key={item.id} album={item} onOpen={openAlbum} />)}
                {hasMore('albums', artist.id) && <button className="album moreCard" onClick={() => loadMore('albums', artist.id)}>More albums</button>}
              </div>
            </div>
            <div className="tracks">
              <div className="sectionHead"><h2>Songs</h2><span>Most popular</span></div>
              <div className="list plain">
                {artistSongs.map((item, index) => <TrackRow key={item.id} track={item} index={index + 1} active={isCurrent(item)} sub={`${item.artist} · ${item.album}`} right={item.year} onPlay={() => playTrack(item)} />)}
              </div>
              {loadMoreButton('songs', artist.id, `Load more songs (${artistSongs.length} of ${totalOf('songs', artist.id) || '…'})`)}
            </div>
          </section>}

          {view === 'album' && album && (
            <DetailView
              type="album"
              item={album}
              onBack={back}
              isPlaying={isPlaying}
              currentTrack={currentTrack}
              keyOf={keyOf}
              playTrack={playTrack}
              togglePlay={togglePlay}
              shuffle={shuffle}
              setShuffle={setShuffle}
              liked={liked}
              toggleLikeTrack={toggleLikeTrack}
              downloadTrack={downloadTrack}
              openArtist={openArtist}
              openAlbum={openAlbum}
              openSong={openSong}
              Icon={Icon}
            />
          )}

          {view === 'song' && selectedSong && (
            <DetailView
              type="song"
              item={selectedSong}
              onBack={back}
              isPlaying={isPlaying}
              currentTrack={currentTrack}
              keyOf={keyOf}
              playTrack={playTrack}
              togglePlay={togglePlay}
              shuffle={shuffle}
              setShuffle={setShuffle}
              liked={liked}
              toggleLikeTrack={toggleLikeTrack}
              downloadTrack={downloadTrack}
              openArtist={openArtist}
              openAlbum={openAlbum}
              openSong={openSong}
              Icon={Icon}
            />
          )}

          {view === 'favArtists' && <section key="favArtists" className="page">
            <Header title="Favorite Artists" onBack={back} />
            <div className="padX">
              {favArtists.length ? <div className="artistGrid">
                {favArtists.map(a => <button className="artistCard" key={a.id} onClick={() => openArtist(a)}>
                  <img src={a.img} alt="" />
                  <strong>{a.name}</strong>
                  <small>Artist</small>
                </button>)}
              </div> : <div className="empty">No favorite artists yet. Tap Follow on an artist page.</div>}
            </div>
          </section>}

          {view === 'liked' && <section key="liked" className="page">
            <Header title="Liked Songs" onBack={back} />
            <div className="list padX">
              {liked.length ? liked.map(item => <TrackRow key={keyOf(item)} track={item} active={isCurrent(item)} right={<Icon name="heart" fill size={16} />} onPlay={() => playTrack(item, liked)} />) : <div className="empty">No liked songs yet. Tap ♥ in the player.</div>}
            </div>
          </section>}

          {view === 'downloads' && <section key="downloads" className="page">
            <Header title="Download" onBack={back} action={downloads.length > 0 && <button className="clearAll" onClick={() => setDownloads([])}>Clear All</button>} />
            <div className="list padX">
              {downloads.length ? downloads.map(item => <TrackRow key={keyOf(item)} track={item} sub={`${item.artist} · ${new Date(item.date).toLocaleDateString()}`} active={isCurrent(item)} right={<span className="ring"><Icon name="play" fill size={12} /></span>} onPlay={() => playTrack(item, downloads)} />) : <div className="empty">Nothing downloaded yet. Use the download button in the player.</div>}
            </div>
          </section>}

          {view === 'history' && <section key="history" className="page">
            <Header title="Recently Played" onBack={back} action={history.length > 0 && <button className="clearAll" onClick={() => setHistory([])}>Clear All</button>} />
            <div className="list padX">
              {history.length ? history.map(item => <TrackRow key={keyOf(item)} track={item} sub={`${item.artist} · ${item.album || 'Single'}`} active={isCurrent(item)} right={<span className="ring"><Icon name="play" fill size={12} /></span>} onPlay={() => playTrack(item, history)} />) : <div className="empty">No playback history yet. Start playing any song!</div>}
            </div>
          </section>}

          {view === 'player' && currentTrack && <section key="player" className="playerScreen">
            <div className="playerTop">
              <button type="button" className="iconBtn" onClick={closePlayer} aria-label="Close player"><Icon name="down" size={26} /></button>
              <span />
              <button type="button" className="iconBtn" onClick={downloadCurrent} aria-label="Download"><Icon name="download" /></button>
            </div>
            <div className="playerMain">
            <div className="art" onPointerDown={onArtDown} onPointerMove={onArtMove} onPointerUp={onArtUp} onPointerCancel={onArtUp}>
              <img
                key={currentTrack.id}
                className={swipe.dir > 0 ? 'fromRight' : swipe.dir < 0 ? 'fromLeft' : ''}
                src={currentTrack.img}
                alt=""
                draggable={false}
                style={{ transform: swipe.x ? `translateX(${swipe.x}px) rotate(${swipe.x / 40}deg)` : undefined, transition: swipe.anim ? 'transform .22s ease-out' : 'none' }}
              />
            </div>
            {isMixing && (
              <div className="automixBanner">
                <span className="pulseWave">
                  <span />
                  <span />
                  <span />
                </span>
                <span>Automixing into {upNext ? upNext.song : 'next track'}…</span>
              </div>
            )}
            <div className="trackInfo">
              <div>
                <h2
                  style={{ cursor: 'pointer' }}
                  onClick={() => openSong(currentTrack)}
                  title="View song details"
                >
                  {currentTrack.song}
                </h2>
                <p
                  style={{ cursor: currentTrack.albumId ? 'pointer' : 'default' }}
                  onClick={() => currentTrack.albumId && openAlbum({ id: currentTrack.albumId, name: currentTrack.album, img: currentTrack.img, artist: currentTrack.artist })}
                  title={currentTrack.album ? `View album: ${currentTrack.album}` : ''}
                >
                  {status || currentTrack.artist}
                </p>
              </div>
              <button onClick={toggleLike} className={`likeBtn ${isLiked ? 'on' : ''}`} aria-label="Like"><Icon name="heart" fill={isLiked} size={26} /></button>
            </div>
            <input className="progress" type="range" min="0" max="100" value={progress} onChange={seek} style={{ '--p': `${progress}%` }} aria-label="Seek" />
            <div className="times"><span>{elapsed}</span><span>-{fmt(duration - currentTime)}</span></div>
            <div className="controls">
              <button onClick={() => setShuffle(v => !v)} className={shuffle ? 'on' : ''} aria-label="Shuffle" aria-pressed={shuffle}><Icon name="shuffle" /></button>
              <button onClick={() => step(-1)} aria-label="Previous"><Icon name="prev" fill size={30} /></button>
              <button className="mainPlay" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}><Icon name={isPlaying ? 'pause' : 'play'} fill size={32} /></button>
              <button onClick={() => step(1)} aria-label="Next"><Icon name="next" fill size={30} /></button>
              <button onClick={() => setRepeat(v => !v)} className={repeat ? 'on' : ''} aria-label="Repeat" aria-pressed={repeat}><Icon name="repeat" /></button>
            </div>
            <div className="playerBar">
              <button
                type="button"
                className={`automixPill ${automix ? 'active' : ''}`}
                onClick={toggleAutomix}
                title={`Automix ${automix ? 'ON (Smart crossfade active)' : 'OFF'}`}
                aria-label="Toggle Automix"
              >
                <Icon name="automix" size={14} />
                <span>Automix</span>
                {automix && <span className="automixDot" />}
              </button>
            </div>
            </div>
            <div className="playerSide">
            {upNext && <div className="upNext">
              <div className="sectionHead"><h2>Up next</h2><span>{queueMode === 'radio' ? 'Similar vibe' : 'In order'}</span></div>
              <TrackRow track={upNext} right={<Icon name="next" fill size={16} />} onPlay={() => step(1)} />
            </div>}
            <div className="lyrics">
              <div className="sectionHead"><h2>Lyrics</h2>{lyrics?.synced && <span>Synced</span>}</div>
              {!lyrics && <div className="empty">Finding lyrics…</div>}
              {lyrics && !lyrics.lines.length && <div className="empty">No lyrics found for this song.</div>}
              {lyrics?.lines.length > 0 && <div className="lyricLines" ref={lyricsRef}>
                {lyrics.lines.map((line, index) => <p key={index} className={index === activeLine ? 'on' : index < activeLine ? 'past' : ''} onClick={() => seekTo(line.t)}>{line.text || ' '}</p>)}
              </div>}
            </div>
            </div>
          </section>}
        </div>

        <div className="dock">
          {currentTrack && <div className={`mini ${view === 'player' ? 'onPlayer' : ''}`}>
            <button className="miniInfo" onClick={() => go('player')}>
              <img src={currentTrack.img} alt="" />
              <span className="rowText"><small>{status || currentTrack.artist}</small><strong>{currentTrack.song}</strong></span>
            </button>
            <div className="miniMobileRight">
              <button
                type="button"
                className={`miniMobileHeart ${isLiked ? 'on' : ''}`}
                onClick={(e) => { e.stopPropagation(); toggleLike(); }}
                aria-label="Like"
              >
                <Icon name="heart" fill={isLiked} size={20} />
              </button>
              <button
                type="button"
                className="miniMobilePlay"
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} fill size={22} />
              </button>
            </div>
            <div className="miniCenter">
              <div className="miniControls">
                <button className="deskOnly" onClick={() => step(-1)} aria-label="Previous"><Icon name="prev" fill size={18} /></button>
                <button className="miniPlay" style={{ '--p': `${progress}%` }} onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}><Icon name={isPlaying ? 'pause' : 'play'} fill size={16} /></button>
                <button className="deskOnly" onClick={() => step(1)} aria-label="Next"><Icon name="next" fill size={18} /></button>
              </div>
              <div className="miniProgress">
                <span>{elapsed}</span>
                <input className="progress" type="range" min="0" max="100" value={progress} onChange={seek} style={{ '--p': `${progress}%` }} aria-label="Seek" />
                <span>{fmt(duration)}</span>
              </div>
            </div>
            <div className="miniActions">
              <button
                type="button"
                className={`miniAutomixBtn ${automix ? 'on' : ''}`}
                onClick={toggleAutomix}
                title={`Automix ${automix ? 'ON' : 'OFF'}`}
                aria-label="Toggle Automix"
              >
                <Icon name="automix" size={18} />
              </button>
              <button onClick={() => go('player')} aria-label="Lyrics">Lyrics</button>
              <button onClick={toggleLike} className={isLiked ? 'on' : ''} aria-label="Like"><Icon name="heart" fill={isLiked} size={18} /></button>
              <button type="button" onClick={downloadCurrent} aria-label="Download"><Icon name="download" size={18} /></button>
            </div>
            <div className="miniBottomBar">
              <div className="miniBottomFill" style={{ width: `${progress}%` }} />
            </div>
          </div>}
          <nav className="nav" aria-label="Main">
            {[
              ['home', 'Home', 'home'],
              ['search', 'Search', 'search'],
              ['library', 'Your Library', 'library']
            ].map(([id, label, icon]) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  className={active ? 'active' : ''}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => goTab(id)}
                >
                  <Icon name={icon} fill={active} size={24} />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {searchOpen && <div className="searchOverlay" onClick={closeSearch}>
          <div className="searchModal" role="dialog" aria-modal="true" aria-label="Search" onClick={event => event.stopPropagation()}>
            <div className="searchField">
              <button className="iconBtn modalBack" onClick={closeSearch} aria-label="Back"><Icon name="back" /></button>
              <Icon name="search" />
              <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search songs, albums or artists" autoComplete="off" aria-label="Search" />
              {query && <button className="clearBtn" onClick={() => setQuery('')} aria-label="Clear search"><Icon name="close" size={18} /></button>}
              <button className="escBtn" onClick={closeSearch}>Esc</button>
            </div>
            <div className="searchTabs" role="tablist">
              {searchTabs.map(([id, label]) => <button key={id} role="tab" aria-selected={searchTab === id} className={searchTab === id ? 'on' : ''} onClick={() => setSearchTab(id)}>{label}</button>)}
            </div>
            <div className="searchBody">
              {!q && <>
                {searchHistory.length > 0 && <>
                  <div className="sectionHead">
                    <h2>Recent searches</h2>
                    <button className="clearAll" type="button" onClick={() => { setSearchHistory([]); try { localStorage.removeItem('sur-search-history'); } catch {} }}>Clear all</button>
                  </div>
                  <div className="chips">
                    {searchHistory.map(term => (
                      <span key={term} className="chipWithRemove">
                        <button type="button" onClick={() => setQuery(term)}>{term}</button>
                        <button type="button" className="chipRemove" onClick={(e) => { e.stopPropagation(); setSearchHistory(prev => { const next = prev.filter(x => x !== term); try { localStorage.setItem('sur-search-history', JSON.stringify(next)); } catch {} return next; }); }} aria-label={`Remove ${term}`}>✕</button>
                      </span>
                    ))}
                  </div>
                </>}

                {history.length > 0 && <>
                  <div className="sectionHead">
                    <h2>Recently played</h2>
                    <button className="clearAll" type="button" onClick={() => setHistory([])}>Clear all</button>
                  </div>
                  <div className="list">
                    {history.slice(0, 8).map(item => (
                      <TrackRow
                        key={keyOf(item)}
                        track={item}
                        active={isCurrent(item)}
                        sub={`${item.artist || 'Unknown'} · Song`}
                        right={<span className="ring"><Icon name="play" fill size={12} /></span>}
                        onPlay={() => playTrack(item, history)}
                      />
                    ))}
                  </div>
                </>}

                <div className="sectionHead"><h2>Try searching</h2></div>
                <div className="chips">
                  {suggestions.map(item => <button key={item} onClick={() => { setQuery(item); addSearchQuery(item); }}>{item}</button>)}
                </div>
                <div className="sectionHead"><h2>Your artists</h2></div>
                <div className="list">
                  {artists.map(a => <TrackRow key={a.id} track={{ song: a.name, img: a.img }} sub="Artist" round onPlay={() => openArtist(a)} right={<Icon name="right" size={16} />} />)}
                </div>
              </>}

              {q && <>
                {(showAll || searchTab === 'artists') && artistHits.length > 0 && <>
                  {favArtists.length > 0 && <>
                  <div className="sectionHead"><h2>Your favorite artists</h2><button onClick={() => go('favArtists')}>Show all</button></div>
                  <div className="artistsRow">
                    {favArtists.map(a => <button className="artistCard" key={a.id} onClick={() => openArtist(a)}>
                      <img src={a.img} alt="" />
                      <strong>{a.name}</strong>
                    </button>)}
                  </div>
                </>}

                <div className="sectionHead"><h2>Artists</h2></div>
                  <div className="list">
                    {artistHits.map(a => <TrackRow key={a.id} track={{ song: a.name, img: a.img }} sub="Artist" round onPlay={() => openArtist(a)} right={<Icon name="right" size={16} />} />)}
                  </div>
                </>}

                {(showAll || searchTab === 'albums') && results.albums.length > 0 && <>
                  <div className="sectionHead"><h2>Albums</h2>{showAll && results.albums.length > 6 && <button onClick={() => setSearchTab('albums')}>Show all</button>}</div>
                  <div className="albums compact">
                    {(showAll ? results.albums.slice(0, 6) : results.albums).map(item => <AlbumCard key={item.id} album={item} onOpen={openAlbum} />)}
                  </div>
                </>}

                {(showAll || searchTab === 'songs') && results.songs.length > 0 && <>
                  <div className="sectionHead"><h2>Songs</h2>{showAll && results.songs.length > 8 && <button onClick={() => setSearchTab('songs')}>Show all</button>}</div>
                  <div className="list">
                    {(showAll ? results.songs.slice(0, 8) : results.songs).map(item => <TrackRow key={item.id} track={item} active={isCurrent(item)} sub={`${item.artist} · ${item.source === 'itunes' ? 'Apple Music preview' : item.album}`} right={<Icon name="play" fill size={16} />} onPlay={() => playTrack(item)} />)}
                  </div>
                  {!showAll && results.more && <button className="loadMore" onClick={loadMoreSongs} disabled={loadingMoreSongs}>{loadingMoreSongs ? 'Loading…' : 'Load more songs'}</button>}
                </>}

                {searching && <ShimmerTrackRows count={6} />}
                {!searching && !artistHits.length && !results.songs.length && !results.albums.length && <div className="empty">No results for “{query}”.</div>}
              </>}
            </div>
          </div>
        </div>}

        {adBreak && <AdBreak adTag={adsConfig.adTag} onDone={finishAd} />}
        {auth && <AuthModal mode={auth.mode} defaultName={profile?.name} onDone={finishAuth} onClose={() => setAuth(null)} />}

        {ready && (!profile || editingTaste) && <Onboarding
          initial={profile || { artists: [] }}
          onDone={saveProfile}
          onClose={profile ? () => setEditingTaste(false) : () => saveProfile({ name: '', languages: ['punjabi'], artists: DEFAULT_ARTISTS })}
        />}

        <audio
          ref={audioRef}
          preload="metadata"
          loop={repeat}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={event => {
            const dur = event.currentTarget.duration;
            setDuration(dur);
            updateMediaPosition(event.currentTarget.currentTime, dur);
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => step(1)}
        />
      </div>
    </main>
  );
}
