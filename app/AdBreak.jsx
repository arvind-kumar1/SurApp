'use client';

import React, { useEffect, useRef, useState } from 'react';

// Google IMA SDK: plays Ad Manager VAST audio/video ads. Skippability comes from the ad itself (set it in Ad Manager).
let imaPromise;
const loadIma = () => imaPromise ||= new Promise((resolve, reject) => {
  if (window.google?.ima) return resolve(window.google.ima);
  const script = document.createElement('script');
  script.src = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js';
  script.async = true;
  script.onload = () => resolve(window.google.ima);
  script.onerror = () => { imaPromise = null; reject(new Error('IMA blocked')); };
  document.head.appendChild(script);
});

const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Spotify-style ad break: looks like the player, ad in the artwork slot, no skip/close.
// onDone(true) after the ad plays, onDone(false) if no ad could be shown.
export default function AdBreak({ adTag, next, Icon, onDone }) {
  const slotRef = useRef(null);
  const videoRef = useRef(null);
  const managerRef = useRef(null);
  const timersRef = useRef([]);
  const doneRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [left, setLeft] = useState(null);

  const finish = ok => {
    if (doneRef.current) return;
    doneRef.current = true;
    timersRef.current.forEach(clearTimeout);
    timersRef.current.forEach(clearInterval);
    try { managerRef.current?.destroy(); } catch {}
    onDone(ok);
  };

  useEffect(() => {
    loadIma().then(() => setReady(true)).catch(() => finish(false));
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current.forEach(clearInterval);
      try { managerRef.current?.destroy(); } catch {}
    };
  }, []);

  // Must run inside the tap: mobile browsers only allow ad audio started by a user gesture.
  const start = () => {
    const ima = window.google?.ima;
    if (!ima) return finish(false);
    setStarted(true);
    const { width, height } = slotRef.current.getBoundingClientRect();
    const display = new ima.AdDisplayContainer(slotRef.current, videoRef.current);
    display.initialize();
    const loader = new ima.AdsLoader(display);

    loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, event => {
      const manager = event.getAdsManager(videoRef.current);
      managerRef.current = manager;
      manager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => finish(false));
      manager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => finish(true));
      manager.addEventListener(ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, () => finish(true));
      manager.addEventListener(ima.AdEvent.Type.STARTED, e => setDuration(Math.max(0, e.getAd()?.getDuration() || 0)));
      manager.addEventListener(ima.AdEvent.Type.PAUSED, () => setPaused(true));
      manager.addEventListener(ima.AdEvent.Type.RESUMED, () => setPaused(false));
      try {
        manager.init(width, height, ima.ViewMode.NORMAL);
        manager.start();
      } catch { return finish(false); }
      timersRef.current.push(setInterval(() => {
        const remaining = manager.getRemainingTime();
        if (remaining >= 0) setLeft(remaining);
      }, 250));
    });
    loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => finish(false));

    const request = new ima.AdsRequest();
    request.adTagUrl = adTag;
    request.linearAdSlotWidth = request.nonLinearAdSlotWidth = Math.round(width);
    request.linearAdSlotHeight = request.nonLinearAdSlotHeight = Math.round(height);
    request.setAdWillAutoPlay(true);
    request.setAdWillPlayMuted(false);
    loader.requestAds(request);
    // No fill / blocked network: don't hold the music hostage forever.
    timersRef.current.push(setTimeout(() => !managerRef.current && finish(false), 12000));
  };

  const togglePlay = () => {
    if (!started) return start();
    const manager = managerRef.current;
    if (!manager) return;
    paused ? manager.resume() : manager.pause();
  };

  const elapsed = duration && left != null ? Math.max(0, duration - left) : 0;
  const pct = duration ? Math.min(100, (elapsed / duration) * 100) : 0;
  const playing = started && !paused;

  return (
    <div className="adBreak" role="dialog" aria-modal="true" aria-label="Advertisement">
      <div className="playerTop">
        <span />
        <strong>Advertisement</strong>
        <span />
      </div>
      <div className="adArt">
        <div className="adSlot" ref={slotRef}>
          <div className="adPoster" aria-hidden="true"><span className="adBadge">Ad</span><strong>Sur</strong></div>
          <video ref={videoRef} playsInline muted className="adContent" />
        </div>
      </div>
      <div className="trackInfo">
        <div>
          <h2>Advertisement</h2>
          <p>{!started ? 'Your music continues after this short ad' : left == null ? 'Loading ad…' : next ? `Up next: ${next.song}` : 'Your music continues shortly'}</p>
        </div>
        <span className="adBadge">Ad</span>
      </div>
      <div className="progress adProgress" style={{ '--p': `${pct}%` }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Ad progress" />
      <div className="times"><span>{fmt(elapsed)}</span><span>{left != null ? `-${fmt(left)}` : '--:--'}</span></div>
      <div className="controls">
        <button disabled aria-label="Shuffle"><Icon name="shuffle" /></button>
        <button disabled aria-label="Previous"><Icon name="prev" fill size={30} /></button>
        <button className="mainPlay" onClick={togglePlay} disabled={!ready} aria-label={playing ? 'Pause ad' : 'Play ad'}><Icon name={playing ? 'pause' : 'play'} fill size={32} /></button>
        <button disabled aria-label="Next"><Icon name="next" fill size={30} /></button>
        <button disabled aria-label="Repeat"><Icon name="repeat" /></button>
      </div>
      <p className="adNote">Ads keep Sur free to use.</p>
    </div>
  );
}
