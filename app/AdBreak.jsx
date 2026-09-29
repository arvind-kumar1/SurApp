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

// Full-screen ad break with no close button. onDone(true) after the ad plays, onDone(false) if no ad could be shown.
export default function AdBreak({ adTag, onDone }) {
  const slotRef = useRef(null);
  const videoRef = useRef(null);
  const managerRef = useRef(null);
  const timersRef = useRef([]);
  const doneRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
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
    setPlaying(true);
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
      try {
        manager.init(width, height, ima.ViewMode.NORMAL);
        manager.start();
      } catch { return finish(false); }
      timersRef.current.push(setInterval(() => {
        const remaining = manager.getRemainingTime();
        if (remaining >= 0) setLeft(Math.ceil(remaining));
      }, 500));
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

  return (
    <div className="adBreak" role="dialog" aria-modal="true" aria-label="Advertisement">
      <div className="adBreakTop">
        <span className="adBadge">Ad</span>
        <span>{playing ? (left != null ? `Your music continues in ${left}s` : 'Loading ad…') : 'Your music continues after this short ad'}</span>
      </div>
      <div className="adSlot" ref={slotRef}>
        <video ref={videoRef} playsInline muted className="adContent" />
        {!playing && (
          <button type="button" className="adStart" onClick={start} disabled={!ready}>
            {ready ? 'Play ad' : 'Loading…'}
          </button>
        )}
      </div>
      <p className="adNote">Ads keep Sur free to use.</p>
    </div>
  );
}
