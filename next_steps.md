What's left, in the order I'd do it

1. ~~Routing and search~~ — done. `/` is the national dex, `/pokemon/:id?gen=N` the species page, header search everywhere, prev/next, form and evolution links.
2. ~~Evolution chain~~ — done, from Showdown's form-aware evo fields rather than veekun's CSV. Full family tree per gen on the species page.
3. ~~Type effectiveness table~~ — done. `type_chart` table in the ETL, `typeDefenses` in the payload, grid on the species page.
4. ~~Encounter locations~~ — done for gens 1–8 (veekun has no BDSP/PLA/SV data). Per-game tabs on the species page.
5. ~~Remaining move methods~~ — done. Tabs per method with TM/HM/TR numbers from veekun's machines.csv; egg moves inherited from the basic stage.
6. Competitive sets — the pkmn.cc layer.
7. Tauri packaging — the .exe for your friend.

Both remaining steps are additive.

My recommendation is routing and search next. Right now you can't check whether Clefairy's Fairy switch renders properly, or whether a Pokémon with three evolutions breaks the layout — you're flying blind on everything except one species. Search fixes that and makes the rest quicker to build.

It needs react-router-dom, a species list page, and a search box wired to the /api/search endpoint you already have. Want me to build it?
