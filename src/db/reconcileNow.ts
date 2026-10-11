import { reconcileAllPending } from "../agents/reconciliationAgent.js";
import { pool } from "./pool.js";

async function main() {
  const count = await reconcileAllPending();
  console.log(`Reconciled ${count} (university, fact_key) pair(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
