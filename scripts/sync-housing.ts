import { writeFile } from "node:fs/promises";
import { collectHousing } from "../src/lib/housing/sync";

const snapshot = await collectHousing();
await writeFile(new URL("../src/data/housing-feed.json", import.meta.url), `${JSON.stringify(snapshot, null, 2)}\n`);
process.stdout.write(`${snapshot.notices.length}건 갱신: ${snapshot.updatedAt}\n`);
