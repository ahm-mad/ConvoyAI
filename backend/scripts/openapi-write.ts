import { buildContract } from '../src/platform/openapi/contract.js';
import {
  writeContract,
  writeCompanion,
  CONTRACT_PATH,
  MODULES_DIR,
} from '../src/platform/openapi/contract-file.js';

const { document, problems } = await buildContract();
if (problems.length) {
  console.error(`openapi:write — refusing to write; ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
writeContract(document);
writeCompanion(document);
const ops = Object.values(document['paths'] as Record<string, object>).reduce(
  (n, item) => n + Object.keys(item).length,
  0
);
console.log(
  `openapi:write — wrote ${ops} operations across module files in ${MODULES_DIR} (index: ${CONTRACT_PATH})`
);
