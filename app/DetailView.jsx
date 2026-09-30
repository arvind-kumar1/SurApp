'use client';

import React, { useState, useEffect, useRef } from 'react';
import { extractColorFromImage } from '@/lib/color';
import AdBanner from './AdBanner';

const fmtDuration = sec => {
  if (!sec || isNaN(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const fmtAlbumTotal = (songs = [], countFallback = null) => {
  const count = songs?.length || countFallback || 0;
  const totalSec = (songs || []).reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
  if (!totalSec) return `${count} ${count === 1 ? 'song' : 'songs'}`;
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  let timeStr = '';
  if (hrs > 0) {
    timeStr = `${hrs} hr ${mins} min`;
  } else if (mins > 0) {
    timeStr = `${mins} min${secs > 0 ? ` ${secs} sec` : ''}`;
  } else {
    timeStr = `${secs} sec`;
  }
  return `${count} ${count === 1 ? 'song' : 'songs'}, ${timeStr}`;
};

export default function DetailView({
  type = 'album', // 'album' | 'song'
  item,
  onBack,
  isPlaying,
  currentTrack,
  keyOf,
  playTrack,
  togglePlay,
  shuffle,
  setShuffle,
  repeatMode = 'off',
  toggleRepeat,
  adsConfig,
  liked = [],
  toggleLikeTrack,
  downloadTrack,
  openArtist,
  openAlbum,
  openSong,
  Icon,
}) {
  const [color, setColor] = useState({ r: 42, g: 68, b: 86, hex: '#2a4456' });
  const [copied, setCopied] = useState(false);
  const [stuck, setStuck] = useState(false);
  const actionBarRef = useRef(null);

  const title = type === 'album' ? item?.name : item?.song;
  const imgUrl = item?.img;

  // Dynamically extract dominant color from cover art
  useEffect(() => {
    if (imgUrl) {
      extractColorFromImage(imgUrl, title || 'cover').then(setColor);
    }
  }, [imgUrl, title]);

  // Show play button in the sticky top bar once the big one scrolls under it
  useEffect(() => {
    const el = actionBarRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { root: el.closest('.scroll'), rootMargin: '-64px 0px 0px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [item]);

  if (!item) return null;

  const isCurrent = track => currentTrack && keyOf(currentTrack) === keyOf(track);

  // Playback state for this album / song
  const tracks = type === 'album' ? (item.songs || []) : (item.albumSongs || [item]);
  const isPlayingThis = isPlaying && (
    type === 'album'
      ? tracks.some(t => isCurrent(t))
      : isCurrent(item)
  );

  const handlePlayClick = () => {
    if (isPlayingThis) {
      togglePlay();
    } else {
      if (type === 'album') {
        if (tracks.length > 0) {
          playTrack(tracks[0], tracks);
        }
      } else {
        playTrack(item, tracks.length > 1 ? tracks : [item]);
      }
    }
  };

  const isSongLiked = type === 'song' ? liked.some(t => keyOf(t) === keyOf(item)) : false;

  const handleSaveClick = () => {
    if (type === 'song') {
      toggleLikeTrack(item);
    } else if (type === 'album' && tracks.length > 0) {
      // Toggle liking all or primary track
      toggleLikeTrack(tracks[0]);
    }
  };

  const handleDownloadClick = (e) => {
    if (type === 'song') {
      downloadTrack(item, e);
    } else if (type === 'album' && tracks.length > 0) {
      downloadTrack(tracks[0], e);
    }
  };

  const handleShareClick = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard?.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section
      key={`${type}-${item.id || title}`}
      className="page detailPage"
      style={{
        '--detail-r': color.r,
        '--detail-g': color.g,
        '--detail-b': color.b,
        '--detail-color': color.hex,
      }}
    >
      {/* Top back navigation */}
      <div className={`detailBackBar ${stuck ? 'stuck' : ''}`}>
        <button
          type="button"
          className="detailBackBtn"
          onClick={onBack}
          aria-label="Back"
        >
          <Icon name="back" size={20} />
        </button>
        <button
          type="button"
          className="detailPlayBtn detailStickyPlay"
          onClick={handlePlayClick}
          aria-label={isPlayingThis ? 'Pause' : 'Play'}
          tabIndex={stuck ? 0 : -1}
        >
          <Icon name={isPlayingThis ? 'pause' : 'play'} fill size={20} />
        </button>
        <span className="detailStickyTitle">{title}</span>
      </div>

      {/* Hero Header */}
      <div className="detailHero">
        <div className="detailCoverWrapper">
          <img
            className="detailCover"
            src={item.img || '/icon.png'}
            alt={title || ''}
            loading="eager"
          />
        </div>

        <div className="detailInfo">
          <span className="detailEyebrow">
            {type === 'album' ? 'Album' : (item.album ? 'Song' : 'Single')}
          </span>

          <h1 className="detailTitle" title={title}>
            {title}
          </h1>

          <div className="detailMeta">
            {item.artistImg ? (
              <img
                className="detailMetaAvatar"
                src={item.artistImg}
                alt={item.artist || ''}
              />
            ) : (
              <span className="detailMetaAvatarPlaceholder">
                {(item.artist || '?').charAt(0).toUpperCase()}
              </span>
            )}

            <span
              className="detailArtistName"
              onClick={() => openArtist && openArtist({ id: item.artistId, name: item.artist, img: item.artistImg })}
            >
              {item.artist || 'Unknown Artist'}
            </span>

            {item.year && (
              <>
                <span className="detailBullet">•</span>
                <span>{item.year}</span>
              </>
            )}

            {type === 'album' && (
              <>
                <span className="detailBullet">•</span>
                <span className="detailSubInfo">
                  {fmtAlbumTotal(item.songs, item.songCount || item.count)}
                </span>
              </>
            )}

            {type === 'song' && (
              <>
                {item.album && (
                  <>
                    <span className="detailBullet">•</span>
                    <span
                      className="detailArtistName"
                      onClick={() => item.albumId && openAlbum && openAlbum({ id: item.albumId, name: item.album, img: item.img, artist: item.artist })}
                    >
                      {item.album}
                    </span>
                  </>
                )}
                {item.duration > 0 && (
                  <>
                    <span className="detailBullet">•</span>
                    <span className="detailSubInfo">{fmtDuration(item.duration)}</span>
                  </>
                )}
                {item.playCount > 0 && (
                  <>
                    <span className="detailBullet">•</span>
                    <span className="detailSubInfo">{item.playCount.toLocaleString()} plays</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="detailActionBar" ref={actionBarRef}>
        <div className="detailActionsLeft">
          <button
            type="button"
            className="detailPlayBtn"
            onClick={handlePlayClick}
            aria-label={isPlayingThis ? 'Pause' : 'Play'}
          >
            <Icon name={isPlayingThis ? 'pause' : 'play'} fill size={26} />
          </button>

          {item.img && (
            <button
              type="button"
              className="detailThumbnailBtn"
              title={title}
              onClick={handlePlayClick}
            >
              <img src={item.img} alt="" />
            </button>
          )}

          <button
            type="button"
            className={`detailIconBtn ${shuffle ? 'active' : ''}`}
            onClick={() => setShuffle(s => !s)}
            title={`Shuffle: ${shuffle ? 'On' : 'Off'}`}
            aria-label="Shuffle"
          >
            <Icon name="shuffle" size={22} />
          </button>

          {toggleRepeat && (
            <button
              type="button"
              className={`detailIconBtn ${repeatMode !== 'off' ? 'active' : ''}`}
              onClick={toggleRepeat}
              title={repeatMode === 'one' ? 'Repeat: Current song' : repeatMode === 'all' ? 'Repeat: All tracks' : 'Repeat: Off'}
              aria-label={repeatMode === 'one' ? 'Repeat Current Song' : repeatMode === 'all' ? 'Repeat All Tracks' : 'Repeat Off'}
            >
              <Icon name={repeatMode === 'one' ? 'repeatOne' : 'repeat'} size={22} />
            </button>
          )}

          <button
            type="button"
            className={`detailIconBtn ${isSongLiked ? 'active' : ''}`}
            onClick={handleSaveClick}
            title={type === 'song' ? (isSongLiked ? 'Liked' : 'Like song') : 'Save to Library'}
            aria-label="Save to Library"
          >
            <Icon name={isSongLiked ? 'circleCheck' : 'circlePlus'} size={24} />
          </button>

          <button
            type="button"
            className="detailIconBtn"
            onClick={handleDownloadClick}
            title="Download"
            aria-label="Download"
          >
            <Icon name="circleDownload" size={24} />
          </button>

          <button
            type="button"
            className="detailIconBtn"
            onClick={handleShareClick}
            title={copied ? 'Link Copied!' : 'Share / More'}
            aria-label="More"
          >
            <Icon name="more" fill size={24} />
          </button>
        </div>

        <div className="detailActionsRight">
          <span className="detailListBadge" title="List View">
            <span>List</span>
            <Icon name="list" size={18} />
          </span>
        </div>
      </div>

      {adsConfig?.bannerEnabled && (
        <div style={{ padding: '0 28px' }}>
          <AdBanner slot={adsConfig.bannerSlot} client={adsConfig.adsenseClient} />
        </div>
      )}

      {/* Track List Table */}
      <div className="detailTracksTable">
        <div className="detailTableHeader">
          <span className="colIndex">#</span>
          <span className="colTitle">Title</span>
          <span className="colActions" />
          <span className="colDuration">
            <Icon name="clock" size={16} />
          </span>
        </div>

        {/* Loading / Empty states */}
        {type === 'album' && !item.songs && (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="detailTrackRow shimmerDetailRow" aria-hidden="true">
              <div className="detailColIndex">
                <div className="shimmerIndex shimmer" />
              </div>
              <div className="detailColTitle">
                <div className="shimmerLine shimmer" style={{ width: `${Math.floor(45 + (i * 7) % 35)}%`, height: '14px' }} />
                <div className="shimmerLine shimmer" style={{ width: `${Math.floor(25 + (i * 9) % 25)}%`, height: '11px', marginTop: '6px' }} />
              </div>
              <div className="detailColActions" />
              <div className="detailColDuration">
                <div className="shimmerDuration shimmer" />
              </div>
            </div>
          ))
        )}
        {type === 'album' && item.songs?.length === 0 && (
          <div className="empty">No playable tracks in this album.</div>
        )}

        {/* Tracks List */}
        {tracks?.map((track, index) => {
          const active = isCurrent(track);
          const activePlaying = active && isPlaying;
          const isTrackLiked = liked.some(t => keyOf(t) === keyOf(track));

          return (
            <div
              key={track.id || `${track.song}-${index}`}
              className={`detailTrackRow ${active ? 'active' : ''}`}
              onClick={() => playTrack(track, tracks)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') playTrack(track, tracks); }}
            >
              <div className="detailColIndex">
                {activePlaying ? (
                  <div className="detailEqualizer" aria-label="Playing">
                    <span />
                    <span />
                    <span />
                  </div>
                ) : (
                  <>
                    <span className="trackNum">{index + 1}</span>
                    <span className="trackPlayIcon">
                      <Icon name="play" fill size={14} />
                    </span>
                  </>
                )}
              </div>

              <div className="detailColTitle">
                <span className="detailSongName">{track.song}</span>
                <span className="detailArtistSubtitle">{track.artist}</span>
              </div>

              <div className="detailColActions">
                <button
                  type="button"
                  className={`detailRowActionBtn ${isTrackLiked ? 'liked' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLikeTrack(track);
                  }}
                  title={isTrackLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                  aria-label="Like track"
                >
                  <Icon name="heart" fill={isTrackLiked} size={16} />
                </button>

                <button
                  type="button"
                  className="detailRowActionBtn"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadTrack(track, e);
                  }}
                  title="Download track"
                  aria-label="Download track"
                >
                  <Icon name="download" size={16} />
                </button>

                {openSong && (
                  <button
                    type="button"
                    className="detailRowActionBtn"
                    onClick={(e) => {
                      e.stopPropagation();
                      openSong(track);
                    }}
                    title="Song details"
                    aria-label="Song details"
                  >
                    <Icon name="more" size={16} />
                  </button>
                )}
              </div>

              <div className="detailColDuration">
                {fmtDuration(track.duration)}
              </div>
            </div>
          );
        })}

        {/* For song view: Album link & details */}
        {type === 'song' && item.album && (
          <div style={{ marginTop: '36px' }}>
            <div className="detailSectionTitle">
              <span>From the album</span>
              {item.albumId && openAlbum && (
                <button
                  type="button"
                  className="clearAll"
                  style={{ textTransform: 'none', fontSize: '13px' }}
                  onClick={() => openAlbum({ id: item.albumId, name: item.album, img: item.img, artist: item.artist })}
                >
                  View full album
                </button>
              )}
            </div>

            <div
              className="detailAlbumCardLink"
              onClick={() => item.albumId && openAlbum && openAlbum({ id: item.albumId, name: item.album, img: item.img, artist: item.artist })}
            >
              <img src={item.img} alt="" />
              <div>
                <strong>{item.album}</strong>
                <small>{[item.year, item.artist, item.label].filter(Boolean).join(' · ')}</small>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
