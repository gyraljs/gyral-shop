# Deploying demo-shop.gyral.dev

How the owner runs the public demo on the VPS, behind the Traefik that already serves
`mcp.gyral.dev`. Why it works this way: [ADR 0007](../design-docs/0007-deployment.md).

What runs: one container from `registry.livepeer.tools/gyraljs/gyral-shop`, pinned by digest,
with a named volume for the SQLite database. On an empty volume it migrates and seeds itself
before it listens, and every night at `DEMO_RESET_AT` it puts the store back to the seed.

## Settings

| Variable              | Value on the VPS                    | Notes                                                                   |
| --------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| `GYRAL_SHOP_IMAGE`    | `registry…/gyral-shop@sha256:…`     | The digest printed by the push (below). Never a moving tag.             |
| `SITE_ORIGIN`         | `https://demo-shop.gyral.dev`       | Must equal the image's `SITE_ORIGIN` build argument.                    |
| `APP_SECRET`          | `openssl rand -hex 32`              | Signs order-access cookies and checkout keys. Required.                 |
| `SEED_ADMIN_PASSWORD` | `openssl rand -base64 18`           | `admin@shop.test`'s password, applied at every reset. Never the default |
| `DEMO_RESET_AT`       | `03:00`                             | Nightly reset, local time in `STORE_TIME_ZONE`.                         |
| `STORE_TIME_ZONE`     | `America/New_York`                  | Also the admin dashboard's calendar.                                    |
| `TRAEFIK_*`           | `proxy`, `websecure`, `letsencrypt` | The names in the existing Traefik setup.                                |

`compose.yaml` sets the rest itself: `NODE_ENV=production`, `PORT=5200` and `TRUST_PROXY=1`.
That last one is safe only because the container publishes no ports, so it can be reached only
through Traefik, and Traefik replaces any `X-Forwarded-*` headers a client sends.

## First deployment

1. **DNS:** add an `A` record (and `AAAA`, if the VPS has IPv6) for `demo-shop.gyral.dev` pointing
   at the VPS, like `mcp.gyral.dev`. Wait until `dig +short demo-shop.gyral.dev` answers with it:
   Let's Encrypt has to reach the name before Traefik can get the certificate.
2. **Files:** on the VPS, make a directory with this repository's `deploy/compose.yaml` and
   `deploy/.env.example`, saved as `.env`:

   ```sh
   mkdir -p ~/gyral-shop && cd ~/gyral-shop
   # copy deploy/compose.yaml and deploy/.env.example here (scp, or from the repository)
   mv .env.example .env && chmod 600 .env
   ```

3. **Fill in `.env`:** the image digest, then the two secrets:

   ```sh
   openssl rand -hex 32       # APP_SECRET
   openssl rand -base64 18    # SEED_ADMIN_PASSWORD (keep it: it is the admin's password)
   ```

4. **Start:**

   ```sh
   docker compose pull && docker compose up -d
   ```

## Verify

```sh
docker compose ps                          # gyral-shop … (healthy), after up to ~30 s
docker compose logs gyral-shop | head      # see below
curl -s https://demo-shop.gyral.dev/healthz     # {"status":"ok"}
curl -sI https://demo-shop.gyral.dev/about | grep -i -E '^(HTTP|cache-control|strict-transport)'
```

The first start logs:

```text
demo: seeded an empty database
demo reset: daily at 03:00 America/New_York
gyral-shop (production): http://localhost:5200 (trusting X-Forwarded-* from the proxy)
```

Later starts say `demo: database kept`. Each night adds
`demo reset: database restored to the seed state (03:00 America/New_York, … ms)`.

In a browser: the home page loads over HTTPS; sign in as any seeded customer
(`*@example.com`, for example `vivienne.yundt1@example.com`, password `gyral-customer-2026`); add
something to the cart and check out with the test card `4242 4242 4242 4242`. Sign in as
`admin@shop.test` with your `SEED_ADMIN_PASSWORD`, and check that `gyral-admin-2026` is refused.

If the container stays unhealthy, `docker compose logs gyral-shop` names the problem. An
`Invalid environment: …` line means a missing or invalid setting in `.env`.

## Update to a new image

Set `GYRAL_SHOP_IMAGE` in `.env` to the new digest, then:

```sh
docker compose pull && docker compose up -d
```

The container is replaced and the database kept. Pending migrations run at startup.

## Roll back

Put the previous digest back in `GYRAL_SHOP_IMAGE` and run `docker compose up -d`. Migrations
only go forward: if the newer image migrated the database and the older one fails on it,
start from a fresh volume (the store is reseeded at startup; only today's demo data is lost):

```sh
docker compose down
docker volume rm gyral-shop_gyral-shop-data    # <directory name>_gyral-shop-data
docker compose up -d
```

## Backups (optional)

The store resets every night, so there is normally nothing to keep. To save a day's database
anyway, write a consistent copy with SQLite's `VACUUM INTO` (safe while the server runs; copying
`shop.db` alone would miss the WAL file), then copy it out:

```sh
docker compose exec gyral-shop node -e "require('@libsql/client').createClient({ url: 'file:/app/data/shop.db' }).execute(\"VACUUM INTO '/app/data/backup.db'\")"
docker compose cp gyral-shop:/app/data/backup.db ./shop-$(date +%F).db
docker compose exec gyral-shop rm /app/data/backup.db
```

## Build and push an image (for a new Gyral release or any change)

Images are built by hand, never by CI (ADR 0004). In a clean checkout of `main` on a machine
with Docker (the VPS is `linux/amd64`; pass `--platform linux/amd64` when building elsewhere):

```sh
pnpm install && pnpm check              # after moving @gyral/* to the new release
SHA=$(git rev-parse HEAD)
IMAGE=registry.livepeer.tools/gyraljs/gyral-shop
docker build \
  --build-arg SITE_ORIGIN=https://demo-shop.gyral.dev \
  --build-arg SOURCE_REVISION="$SHA" \
  -t "$IMAGE:sha-$SHA" -t "$IMAGE:latest" .
docker push "$IMAGE:sha-$SHA" && docker push "$IMAGE:latest"
docker buildx imagetools inspect "$IMAGE:sha-$SHA" | grep -m1 Digest   # → GYRAL_SHOP_IMAGE
```

Then update the VPS as above with `GYRAL_SHOP_IMAGE=$IMAGE@sha256:…`. To try an image before
pushing it, run it read-only with a scratch volume:

```sh
docker run -d --name shop-try --read-only --tmpfs /tmp -p 127.0.0.1:5200:5200 \
  -v shop-try:/app/data -e APP_SECRET=$(openssl rand -hex 32) \
  -e SEED_ADMIN_PASSWORD=try-admin-password -e DEMO_RESET_AT=03:00 "$IMAGE:sha-$SHA"
sleep 10 && curl -s localhost:5200/healthz
docker rm -f shop-try && docker volume rm shop-try
```

To bump the base image, pick a Node 24 patch released at least two weeks ago (Gyral's ADR 0032),
run `docker buildx imagetools inspect node:24.x.y-bookworm-slim` and put the tag and its index
digest in the `Dockerfile`'s `NODE_IMAGE` default.
