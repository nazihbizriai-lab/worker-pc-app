#!/usr/bin/env node
// One-time helper: create the four WorkCrew subscription prices in Stripe and
// print the four price ids to paste into your environment (the local .env for
// testing, or the Render dashboard for production).
//
// Usage (PowerShell):
//   $env:STRIPE_SECRET_KEY="sk_test_..."; node scripts/create-stripe-prices.cjs
// Usage (bash / Git Bash):
//   STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-prices.cjs
//
// Flags:
//   --dry-run   Print what would be created, without calling Stripe at all.
//   --live      Required to proceed when the key is a live key (sk_live_...).
//
// Run it once per mode. Stripe does not de-duplicate, so running it twice makes
// duplicate products; if you re-run, keep the newest ids it prints.
//
// The dollar amounts below MUST match PLAN_CATALOG in
// packages/contracts/src/index.ts (a test there locks yearly = monthly * 10).
// If you ever change a plan price, change it in both places.

const PLANS = [
  { key: "pro", name: "WorkCrew Pro", monthlyUsd: 27, yearlyUsd: 270 },
  { key: "ultra", name: "WorkCrew Ultra", monthlyUsd: 200, yearlyUsd: 2_000 }
];

const INTERVALS = [
  { interval: "month", label: "Monthly", suffix: "MONTHLY" },
  { interval: "year", label: "Yearly", suffix: "YEARLY" }
];

function envVarName(planKey, suffix) {
  return `STRIPE_${planKey.toUpperCase()}_${suffix}_PRICE_ID`;
}

function usdFor(plan, interval) {
  return interval === "month" ? plan.monthlyUsd : plan.yearlyUsd;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const key = process.env.STRIPE_SECRET_KEY || "";

  if (!key && !dryRun) {
    console.error(
      "Set STRIPE_SECRET_KEY first, for example:\n" +
        "  STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-prices.cjs\n" +
        "Or preview without a key:\n" +
        "  node scripts/create-stripe-prices.cjs --dry-run"
    );
    process.exit(1);
  }

  const isLive = key.startsWith("sk_live_");
  if (isLive && !args.has("--live")) {
    console.error(
      "That is a LIVE Stripe key (sk_live_...). To avoid creating real products by\n" +
        "accident, re-run with --live once you are sure. For testing, use a sk_test_ key."
    );
    process.exit(1);
  }

  const mode = isLive ? "LIVE" : "TEST";
  console.log(`Creating WorkCrew prices in Stripe ${mode} mode${dryRun ? " (dry run, no API calls)" : ""}.\n`);

  const results = [];

  if (dryRun) {
    for (const plan of PLANS) {
      for (const { interval, suffix } of INTERVALS) {
        const usd = usdFor(plan, interval);
        results.push({ env: envVarName(plan.key, suffix), id: "price_(dry-run)", note: `${plan.name} ${interval}ly $${usd}` });
      }
    }
  } else {
    let Stripe;
    try {
      Stripe = require("stripe");
    } catch {
      console.error("Could not load the 'stripe' package. Run 'npm install' in the project root first.");
      process.exit(1);
    }
    const stripe = new Stripe(key);
    for (const plan of PLANS) {
      const product = await stripe.products.create({ name: plan.name });
      for (const { interval, suffix } of INTERVALS) {
        const usd = usdFor(plan, interval);
        const price = await stripe.prices.create({
          product: product.id,
          currency: "usd",
          unit_amount: usd * 100, // Stripe amounts are in cents
          recurring: { interval }
        });
        results.push({ env: envVarName(plan.key, suffix), id: price.id, note: `${plan.name} ${interval}ly $${usd}` });
      }
    }
  }

  console.log("Done. Paste these four lines into your .env (local) or into Render (production):\n");
  for (const r of results) {
    console.log(`${r.env}=${r.id}   # ${r.note}`);
  }
  console.log(`\nReminder: these are ${mode} prices. Use the matching ${mode} STRIPE_SECRET_KEY and webhook secret.`);
}

main().catch((error) => {
  console.error("\nFailed:", error && error.message ? error.message : error);
  process.exit(1);
});
