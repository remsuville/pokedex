What's left, in the order I'd do it

1. ~~Routing and search~~ — done. `/` is the national dex, `/pokemon/:id?gen=N` the species page, header search everywhere, prev/next, form and evolution links.
2. ~~Evolution chain~~ — done, from Showdown's form-aware evo fields rather than veekun's CSV. Full family tree per gen on the species page.
3. ~~Type effectiveness table~~ — done. `type_chart` table in the ETL, `typeDefenses` in the payload, grid on the species page.
4. ~~Encounter locations~~ — done for gens 1–8 (veekun has no BDSP/PLA/SV data). Per-game tabs on the species page.
5. ~~Remaining move methods~~ — done. Tabs per method with TM/HM/TR numbers from veekun's machines.csv; egg moves inherited from the basic stage.
6. ~~Movedex, Abilitydex, Itemdex~~ — done. `/moves`, `/abilities`, `/items` with detail pages, gen tabs, game descriptions and reverse lookups (who learns it / has it / holds it / evolves with it). Header search covers all four.
7. Windows packaging — the .exe for your friend. Electron, sprites pruned to static + artwork (~350 MB). Plan and terms in `PACKAGING.md`.
8. Competitive sets — the pkmn.cc layer.

Both are additive. Packaging first: it's what the project is for, and it's a day, not a week.
