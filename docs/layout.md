~/pokemon/pokedex/
├── package.json            ← backend deps
├── build-db.ts             ← the ETL
├── tsconfig.json
├── docs/
│   ├── ARCHITECTURE.md     ← the long-form guide
│   ├── SQL_GUIDE.md        ← learn SQL on this database
│   ├── PACKAGING.md        ← shipping it as a Windows .exe
│   ├── layout.md           ← this file
│   └── next_steps.md       ← roadmap
├── data/
│   └── pokedex.sqlite      ← built database (55 MB)
├── vendor/                 ← gitignored
│   ├── pokeapi/            ← veekun CSVs
│   └── sprites/            ← sprite images
├── scratch/
│   ├── gen-check.ts
│   ├── show.ts
│   └── pack-server.ts      ← local pack server for desktop testing
├── scripts/
│   └── pack-sprites.ts     ← builds the sprite zips + manifest
├── src/
│   ├── server.ts           ← Hono API (createApp/start)
│   ├── assets.ts           ← sprite-pack downloader
│   └── db/
│       └── queries.ts      ← all the SQL
├── desktop/                ← Electron shell, own npm project
│   ├── main.ts
│   ├── manifest.json
│   └── electron-builder.yml
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
        │   ├── dex.ts      ← list hooks + name/number search
        │   ├── sort.ts     ← column sorting
        │   ├── filters.ts  ← URL-backed list filters
        │   └── useDetail.ts
        ├── pages/
        │   ├── DexPage.tsx        ← /            national dex table
        │   ├── SpeciesPage.tsx    ← /pokemon/:id the species page
        │   ├── MoveDexPage.tsx    ← /moves
        │   ├── MovePage.tsx       ← /move/:id
        │   ├── AbilityDexPage.tsx ← /abilities
        │   ├── AbilityPage.tsx    ← /ability/:id
        │   ├── ItemDexPage.tsx    ← /items
        │   ├── ItemPage.tsx       ← /item/:id
        │   └── SqlPage.tsx        ← /sql         read-only SQL console
        └── components/
            ├── SearchBox.tsx
            ├── GenTabs.tsx
            ├── TabStrip.tsx
            ├── PokemonList.tsx
            ├── FlavorList.tsx
            ├── Filters.tsx
            ├── SortTh.tsx
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
