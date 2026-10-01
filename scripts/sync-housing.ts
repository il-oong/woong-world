import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { collectHousing } from "../src/lib/housing/sync";

async function main() {
  const snapshot = await collectHousing();
  await writeFile(resolve(process.cwd(), "src/data/housing-feed.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  process.stdout.write(`${snapshot.notices.length}건 갱신: ${snapshot.updatedAt}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
