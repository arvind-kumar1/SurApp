# Punjabi Song Finder — Next.js

A responsive Next.js App Router version of the Punjabi Song Finder project.

## Included

- Purple / yellow music-app UI
- Responsive desktop, tablet and mobile layout
- 73 local songs across Arjan Dhillon and Karan Aujla
- Lyric/title matching
- Music API search using `https://musicapi.x007.workers.dev`
- In-site audio playback when a direct stream is available
- Previous / play / next controls
- Like/unlike with browser localStorage
- Library with liked songs and artist collections
- Download action for the currently available stream URL
- YouTube Music and Spotify search shortcuts
- Artist images supplied in the original project

## Run locally

Requirements: Node.js 20.9+ is recommended for the current Next.js App Router workflow.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production build

```bash
npm run build
npm start
```

## Notes

The music search and playback depend on the third-party Music API and the browser's ability to load the returned stream. The download button opens the currently available stream URL and is subject to provider/browser restrictions.

The current project is a responsive web app. Native Android/iOS apps would be a separate React Native or native build.
