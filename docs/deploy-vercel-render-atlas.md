# Deploy: Vercel + Render + MongoDB Atlas

Deploy the merged `develop` branch. Vercel hosts `client`; Render hosts `server`;
Atlas provides the MongoDB replica set. The deployment build does not push a
database schema, seed data, or run backfills.

## 1. Atlas

Create or select the intended cluster and database. Create a database user scoped
to that database, then obtain its Node.js connection string from **Connect**.
Use an explicit database name, for example:

```text
mongodb+srv://USER:URL_ENCODED_PASSWORD@CLUSTER/hotel_lobby_staging?retryWrites=true&w=majority
```

Save it only as Render's secret `DATABASE_URL`. Add the Render service's outbound
IP ranges (Dashboard → service → Connect → Outbound) to Atlas **Network Access**.
For local administration, temporarily allow your own IP as well.

An empty staging database needs Prisma indexes and an initial administrator.
From `server`, after setting `DATABASE_URL` privately to the verified **empty
staging** database, run `npm run db:push`. If demo data is desired, set
`DEMO_ADMIN_EMAIL` and `DEMO_ADMIN_PASSWORD` (at least 12 characters), then run
`npm run db:seed:demo`. This creates demo rooms as well as an administrator.
For an existing database, follow `implementation-audit.md`, the booking claims
audit and payment reconciliation runbooks before enabling writes. Never seed
or push automatically as part of deploy.

## 2. Render API

Import this repository as a Blueprint using root `render.yaml`. It selects
branch `develop`, root `server`, Node 24, and readiness path `/ready`. Automatic
deployment is off so each release can follow successful CI. Alternatively,
create a Web Service with the same settings:

| Setting | Value |
| --- | --- |
| Branch | `develop` |
| Root Directory | `server` |
| Build Command | `npm ci --include=dev && npx prisma validate` |
| Start Command | `npm start` |
| Health Check Path | `/ready` |
| NODE_VERSION | `24.21.0` |
| NODE_ENV | `production` |
| DATABASE_URL | Atlas secret with explicit database name |
| CORS_ORIGINS | Exact Vercel production origin, without a trailing slash |
| PUBLIC_CORS_ORIGINS | Exact Vercel production origin, without a trailing slash |

If the Vercel URL is not available yet, set the origin variables once that
project is created, then redeploy the API. Multiple origins are comma-separated;
preview deployments need their exact URLs added explicitly. Do not use `*`.

Check `https://YOUR-RENDER-SERVICE.onrender.com/health` returns 200 and `/ready`
returns 200 after Atlas network access is configured.

The current limiter keys requests by `req.ip` and Express does not trust proxy
headers. Before opening to real traffic, verify Render's forwarding behavior
and configure a verified proxy allowlist or edge rate limiting. Otherwise users
behind a shared proxy may share the login/public API rate limit. Do not enable
`trust proxy = true` indiscriminately.

## 3. Vercel web

Import `Dataserial/Hotel-Lobby`, choose **Vite**, and set **Root Directory** to
`client`. Set the production branch to `develop` in project Git settings.
`client/vercel.json` supplies installation, build and output settings.

Set this environment variable for Production (and Preview if previews should
use the same API) **before deployment**:

```text
VITE_API_BASE_URL=https://YOUR-RENDER-SERVICE.onrender.com/api
```

This variable is public and is included in the built JavaScript. Never put the
Atlas URI or passwords in a `VITE_*` variable. Redeploy the frontend whenever
this API URL changes. Copy the final production origin back to both Render
CORS variables.

## 4. Release verification

Local check on 2026-10-09: frontend lint, all 5 regression tests, and production
build passed; backend syntax and Prisma validation passed. The isolated runner
passed the booking, auth, claims, payment and stay suites. Task 5's full HTTP
flow timed out on the first run; rerunning Task 5 with the same 30-second test
timeout passed all 7 tests in a combined 6.1-second run with the 4 departure
regression tests. This records local verification only; remote CI, Atlas
connectivity and hosted smoke checks are still pending.

Wait for the GitHub backend validation workflow for the release revision.
Locally run client lint, test and build; server lint, Prisma validate and the
isolated backend suite. The suite uses disposable test databases.

On the deployed site, check public room availability, staff login, dashboard
and logout. Verify browser Network requests reach Render and return the exact
Vercel origin in `Access-Control-Allow-Origin`. Run booking/payment/stay smoke
flows against staging fixtures only. Do not create fake payments in real data.

Rollback by redeploying the prior application revision on both services; data
recovery remains a separate operation.

References: [Vercel Vite](https://vercel.com/docs/frameworks/frontend/vite),
[Render Blueprint specification](https://render.com/docs/blueprint-spec),
[Atlas connection requirements](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/).
