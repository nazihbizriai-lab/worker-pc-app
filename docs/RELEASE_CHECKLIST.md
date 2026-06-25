# Release checklist

Pre-launch items that are intentionally NOT configured in code yet.

## Windows code signing (TODO before a wide public launch)

Status: not configured. The installer is built unsigned, so first-time downloaders
see the Windows SmartScreen "Windows protected your PC" prompt (More info -> Run
anyway). This is a launch-experience issue, not a functional one: the app installs
and auto-updates correctly.

When a certificate has been purchased, wire it in (do NOT commit the certificate or
its password):

- Obtain an OV or EV Windows code-signing certificate (EV clears SmartScreen
  fastest).
- Provide it to the build via the standard electron-builder environment variables
  at build time only: `CSC_LINK` (path or base64 of the .pfx) and
  `CSC_KEY_PASSWORD`. Do not place these in `package.json` or any committed file.
- Optionally set `verifyUpdateCodeSignature` so electron-updater rejects an update
  whose publisher does not match.
- Rebuild and publish a signed release, then verify install + auto-update on a
  clean Windows machine.

Until then: do not block the build on missing signing credentials, and do not add
placeholder or fake signing values.

## Other owner-side launch settings (not code)

These live in the deployment environment (Render), not the repo:

- Production database (`DATABASE_URL`) is required at boot.
- Stripe live secret key + the four plan price IDs, and the webhook secret
  (`STRIPE_WEBHOOK_SECRET`) added after the first deploy.
- `WORKCREW_DOWNLOAD_URL` for the landing-page download button.
- Billing entitlement is strict by default (active/trialing only). Set
  `WORKCREW_BILLING_GRACE_PAST_DUE=true` only if a past_due grace period is wanted.
