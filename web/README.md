# web/ — the frontend

React 19 + Vite + Tailwind v4. A separate npm project: run `npm install`
here, not at the repo root.

```sh
npm run dev       # http://localhost:5173, proxies /api and /sprites to the backend on :3000
npm run build     # web/dist — what the desktop app and the CI installer bundle
npm run lint      # oxlint
```

Start the backend first (`npm run dev:api` at the root). What each file
does is in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md), sections 3 and 4.
