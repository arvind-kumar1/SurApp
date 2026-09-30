'use client';

import React, { useEffect, useRef } from 'react';

export default function AdBanner({ slot = '', className = '', client = '' }) {
  const pushedRef = useRef(false);
  const adsenseClient = client || process.env.NEXT_PUBLIC_ADSENSE_CLIENT || '';

  useEffect(() => {
    if (typeof window === 'undefined' || !adsenseClient) return;
    if (pushedRef.current) return;
    try {
      if (window.adsbygoogle) {
        window.adsbygoogle.push({});
        pushedRef.current = true;
      }
    } catch {}
  }, [adsenseClient]);

  return (
    <div className={`adBannerContainer ${className}`} role="complementary" aria-label="Advertisement">
      <div className="adBannerTag">Sponsored</div>
      <div className="adBannerCard">
        {adsenseClient ? (
          <ins
            className="adsbygoogle"
            style={{ display: 'block', minHeight: '60px', width: '100%' }}
            data-ad-client={adsenseClient.startsWith('ca-') ? adsenseClient : `ca-${adsenseClient}`}
            data-ad-slot={slot || undefined}
            data-ad-format="horizontal"
            data-full-width-responsive="true"
          />
        ) : (
          <div className="adBannerPlaceholder">
            <div className="adPlaceholderLeft">
              <span className="adBadge">Ad</span>
              <div>
                <strong>Explore Premium Music & Top Punjabi Hits</strong>
                <p>Stream songs with synced lyrics, automix, and smart recommendations</p>
              </div>
            </div>
            <button
              type="button"
              className="adCtaBtn"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.open('https://google.com', '_blank', 'noopener,noreferrer');
                }
              }}
            >
              Learn More
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
