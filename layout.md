~/pokemon/pokedex/
├── package.json            ← backend deps
├── build-db.ts             ← the ETL
├── tsconfig.json
├── data/
│   └── pokedex.sqlite      ← built database
├── vendor/                 ← gitignored
│   ├── pokeapi/            ← veekun CSVs
│   └── sprites/            ← sprite images
├── scratch/
│   ├── gen-check.ts
│   └── show.ts
├── src/
│   ├── server.ts           ← Hono API
│   └── db/
│       └── queries.ts      ← all the SQL
└── web/                    ← separate npm project
    ├── package.json        ← frontend deps
    ├── vite.config.ts
    └── src/
        ├── App.tsx         ← the page you're looking at
        ├── main.tsx
        ├── index.css       ← Tailwind theme + type colours
        ├── types.ts
        ├── lib/
        │   └── api.ts
        └── components/
            ├── TypePill.tsx
            ├── DataTable.tsx
            ├── StatBars.tsx
            └── MoveTable.tsx
