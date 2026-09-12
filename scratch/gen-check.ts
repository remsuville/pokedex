import { Dex } from '@pkmn/dex';
import { Generations } from '@pkmn/data';

const gens = new Generations(Dex);

const TARGETS = ['gliscor', 'clefairy', 'pikachu'];
const GENS = [1, 4, 5, 6, 9];

for (const name of TARGETS) {
  console.log(`\n########## ${name.toUpperCase()} ##########`);

  for (const n of GENS) {
    const gen = gens.get(n);
    const species = gen.species.get(name);

    if (!species) {
      console.log(`\n--- Gen ${n}: not in this generation ---`);
      continue;
    }

    const bs = species.baseStats;
    const bst = Object.values(bs).reduce((a, b) => a + b, 0);

    console.log(`\n--- Gen ${n} ---`);
    console.log(`Types:     ${species.types.join(' / ')}`);
    console.log(`Base:      HP ${bs.hp}  Atk ${bs.atk}  Def ${bs.def}  SpA ${bs.spa}  SpD ${bs.spd}  Spe ${bs.spe}   (BST ${bst})`);
    console.log(`Abilities: ${Object.values(species.abilities).join(', ') || '(none this gen)'}`);

    const ls = await gen.learnsets.get(name);
    const levelUp: { level: number; move: string }[] = [];

    for (const [moveId, sources] of Object.entries(ls?.learnset ?? {})) {
      for (const src of sources as string[]) {
        // source format: "<gen><method><level?>" e.g. "4L23", "8M", "5E"
        if (src[0] === String(n) && src[1] === 'L') {
          levelUp.push({
            level: parseInt(src.slice(2), 10) || 0,
            move: gen.moves.get(moveId)?.name ?? moveId,
          });
        }
      }
    }

    levelUp.sort((a, b) => a.level - b.level || a.move.localeCompare(b.move));
    console.log(`Level-up moves (${levelUp.length}):`);
    for (const m of levelUp) {
      console.log(`   Lv ${String(m.level).padStart(3)}   ${m.move}`);
    }
  }
}
