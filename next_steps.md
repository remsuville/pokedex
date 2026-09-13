What's left, in the order I'd do it

1. Routing and search — reach all 1,025 instead of just Gliscor. This is the biggest jump in usefulness and everything after it is easier to test once you can navigate.
2. Evolution chain — needs an ETL change. You store prevo and evo_level but not the method (stone, trade, friendship), so the veekun pokemon_evolution.csv has to come in.
3. Type effectiveness table — the weakness grid from your Serebii screenshot. Gen-accurate, since the chart changed in gens 2 and 6.
4. Encounter locations — encounters.csv, self-contained, no dependencies on anything else.
5. Remaining move methods — TM, tutor, egg as tabs alongside level-up.
6. Competitive sets — the pkmn.cc layer.
7. Tauri packaging — the .exe for your friend.

Steps 2 and 3 need the ETL touched; the rest are additive.

My recommendation is routing and search next. Right now you can't check whether Clefairy's Fairy switch renders properly, or whether a Pokémon with three evolutions breaks the layout — you're flying blind on everything except one species. Search fixes that and makes the rest quicker to build.

It needs react-router-dom, a species list page, and a search box wired to the /api/search endpoint you already have. Want me to build it?
