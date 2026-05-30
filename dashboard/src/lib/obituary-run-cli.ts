// Local runner for the obituary ingest — no serverless 300s limit. Same logic as the cron route.
//   cd dashboard && DATABASE_URL=... npx tsx src/lib/obituary-run-cli.ts [--dry]
import { syncObituaries } from './obituary-ingest';

syncObituaries({ apply: !process.argv.includes('--dry') })
  .then((s) => { console.log(JSON.stringify(s)); process.exit(0); })
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
