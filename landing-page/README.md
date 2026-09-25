# LeaseOps Landing Page

React (Vite + React 19 + react-router) rebuild of the LeaseOps static site (plain HTML/CSS/
vanilla-JS, no framework/build tool in the source). Two routes: `/` (the main landing page) and
`/demo` (the "watch it answer a call" audio-sync widget). See `PORTING_RULES.md` for scope,
sources of truth, and the porting standard this was held to.

Deployed as its own Vercel project from this folder. Sign in / sign up link out to the dashboard
app at `simplr.pro` — see `src/config/site.js`.

## Develop
```
npm install
npm run dev
```

## Verify parity against the original static site
```
npm run serve:original   # serves reference/original on :5500
npm run dev               # :5173
REACT_BASE=http://localhost:5173 npm run parity -- home demo
```

## Production build + Lighthouse
```
npm run build
npm run preview           # :4173
npm run lighthouse
```
