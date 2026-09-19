What's left, in the order I'd do it

1. ~~Routing and search~~ — done. `/` is the national dex, `/pokemon/:id?gen=N` the species page, header search everywhere, prev/next, form and evolution links.
2. ~~Evolution chain~~ — done, from Showdown's form-aware evo fields rather than veekun's CSV. Full family tree per gen on the species page.
3. ~~Type effectiveness table~~ — done. `type_chart` table in the ETL, `typeDefenses` in the payload, grid on the species page.
4. ~~Encounter locations~~ — done for gens 1–8 (veekun has no BDSP/PLA/SV data). Per-game tabs on the species page.
5. ~~Remaining move methods~~ — done. Tabs per method with TM/HM/TR numbers from veekun's machines.csv; egg moves inherited from the basic stage.
6. ~~Movedex, Abilitydex, Itemdex~~ — done. `/moves`, `/abilities`, `/items` with detail pages, gen tabs, game descriptions and reverse lookups (who learns it / has it / holds it / evolves with it). Header search covers all four.
7. ~~Windows packaging~~ — done. `desktop/` Electron shell, first-run sprite download from `pokedex-assets`, CI builds the installer on a `desktop-v*` tag. First release `desktop-v0.2.0` installed and verified on Windows. See `PACKAGING.md`.
8. Competitive sets — the pkmn.cc layer.

Desktop follow-ups, none urgent:

- Merge `electron` into `master` so the public repo's default branch matches the release.
- In-app "check for updates" — today a new version means downloading the installer by hand.
- A CI check that the tag matches `desktop/package.json`'s version.
- Linux/macOS builds. `pack:linux` already produces a runnable directory; a real AppImage/DMG target is a few lines of `electron-builder.yml`.
- Code signing, if SmartScreen ever becomes a nuisance.
