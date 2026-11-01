// Creates (and removes stale) indexes for every collection so they match the
// schemas in server/db/models. Run it on every production deploy, because the
// app does not auto-build indexes when NODE_ENV=production.
//
//   pnpm db:indexes
import "./load-env";
import { connectToDatabase, disconnectFromDatabase } from "../db/connect";
import { allModels } from "../db/models";

async function main() {
  const mongoose = await connectToDatabase({ autoIndex: false });
  console.log(`Syncing indexes on database "${mongoose.connection.name}"...`);

  for (const model of allModels) {
    const dropped = await model.syncIndexes();
    const indexes = await model.listIndexes();
    const note = dropped.length > 0 ? `  (dropped stale: ${dropped.join(", ")})` : "";
    console.log(`  ${model.collection.collectionName.padEnd(20)} ${indexes.length} indexes${note}`);
  }
  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(disconnectFromDatabase);
