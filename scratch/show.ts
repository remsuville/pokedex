import { getSpecies } from '../src/db/queries.js';
const p = getSpecies(process.argv[2] ?? 'gliscor', Number(process.argv[3] ?? 9));
console.log(JSON.stringify(p, null, 2));
