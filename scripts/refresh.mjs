import { spawnSync } from "node:child_process";

const archive = process.argv[2];
const steps = [
  ...(archive ? [{ label: "Importing Takeout", command: "node", args: ["scripts/import-takeout.mjs", archive] }] : []),
  { label: "Refreshing artist metadata", command: "npm", args: ["run", "enrich"] },
  { label: "Rebuilding playlist analysis", command: "npm", args: ["run", "analyze"] },
  { label: "Reconciling timestamps and sessions", command: "npm", args: ["run", "model"] },
  { label: "Projecting the taste cosmos", command: "npm", args: ["run", "cosmos"] },
  { label: "Verifying the application", command: "npm", args: ["run", "build"] },
];

for (const step of steps) {
  console.log(`\n==> ${step.label}`);
  const result = spawnSync(step.command, step.args, { cwd: new URL("../", import.meta.url), stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("\nTaste Cosmos refresh complete.");
