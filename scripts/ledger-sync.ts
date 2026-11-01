// Writes pending skill-coin events from MongoDB to the Fabric ledger.
//
//   npm run ledger:sync               # pending and failed events only
//   npm run ledger:sync -- --resync   # every event (after `npm run fabric:clean`)
import "./load-env";
import { connectToDatabase, disconnectFromDatabase } from "../lib/db/connect";
import { closeLedgerConnections } from "../lib/ledger/gateway";
import { syncWalletEventsToLedger } from "../lib/ledger/sync";

async function main() {
  await connectToDatabase({ autoIndex: false });
  const resync = process.argv.includes("--resync");
  console.log(resync ? "Re-sending every wallet event to the ledger..." : "Sending pending wallet events to the ledger...");
  const report = await syncWalletEventsToLedger({ resync, onProgress: (line) => console.log(line) });
  console.log(
    `\nCommitted: ${report.committed}  Already on ledger: ${report.alreadyOnLedger}  Failed: ${report.failed.length}`,
  );
  if (report.failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeLedgerConnections();
    await disconnectFromDatabase();
  });
