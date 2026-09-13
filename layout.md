~/pokemon/pokedex/
├── package.json            ← backend deps
├── build-db.ts             ← the ETL
├── tsconfig.json
├── ARCHITECTURE.md         ← the long-form guide
├── next_steps.md           ← roadmap
├── SQL_GUIDE.md            ← learn SQL on this database
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
        ├── main.tsx        ← entry, BrowserRouter
        ├── App.tsx         ← header + routes
        ├── index.css       ← Tailwind theme + type colours
        ├── types.ts        ← payload shapes, mirrored from queries.ts
        ├── lib/
        │   ├── api.ts      ← fetch wrappers
        │   └── dex.ts      ← useDex() + name/number search
        ├── pages/
        │   ├── DexPage.tsx       ← /            national dex table
        │   ├── SpeciesPage.tsx   ← /pokemon/:id the species page
        │   └── SqlPage.tsx       ← /sql         read-only SQL console
        └── components/
            ├── SearchBox.tsx
            ├── PixelSprite.tsx
            ├── Tooltip.tsx
            ├── TypePill.tsx
            ├── DataTable.tsx
            ├── StatBars.tsx
            ├── TypeDefenses.tsx
            ├── EvolutionChain.tsx
            ├── EncounterPanel.tsx
            ├── MovesPanel.tsx
            └── MoveTable.tsx
