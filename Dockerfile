# gyral-shop production image (docs/design-docs/0007-deployment.md, docs/references/deploying.md).
# Built by hand, never by CI (ADR 0004):
#
#   docker build --build-arg SITE_ORIGIN=https://demo-shop.gyral.dev \
#     --build-arg SOURCE_REVISION=$(git rev-parse HEAD) -t gyral-shop .
#
# The base image is pinned by digest (the multi-arch index). To move to a newer Node 24 patch:
# `docker buildx imagetools inspect node:24-bookworm-slim`, then update the default below.
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

# pnpm at the version package.json's packageManager names, through Node 24's corepack.
FROM ${NODE_IMAGE} AS pnpm
ENV CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./

# Client build and prerendered pages. Prerendering reads the departments from a seeded
# database (a throwaway one here) and bakes SITE_ORIGIN into canonical links and JSON-LD.
FROM pnpm AS build
RUN pnpm install --frozen-lockfile
COPY . .
ARG SITE_ORIGIN=https://demo-shop.gyral.dev
RUN export DATABASE_URL=file:/tmp/build/shop.db \
    && pnpm exec tsx src/db/migrate.ts \
    && pnpm exec tsx scripts/seed.ts > /dev/null \
    && SITE_ORIGIN="${SITE_ORIGIN}" pnpm build

# Runtime dependencies only: the server runs its TypeScript through tsx, and demo seeding uses
# faker, so both are dependencies. Installed on this platform, so native packages
# (@libsql/client's linux-x64-gnu binary, esbuild) match the runtime image.
FROM pnpm AS deps
RUN pnpm install --frozen-lockfile --prod

FROM ${NODE_IMAGE}
ARG SITE_ORIGIN=https://demo-shop.gyral.dev
ARG SOURCE_REVISION=development
LABEL org.opencontainers.image.source="https://github.com/gyraljs/gyral-shop" \
    org.opencontainers.image.description="gyral-shop, a department-store demo built with Gyral" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.revision="${SOURCE_REVISION}" \
    dev.gyral.shop.site-origin="${SITE_ORIGIN}"
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json tsconfig.json ./
COPY drizzle ./drizzle
COPY src ./src
# The SQLite volume. A new named volume takes this directory's owner, so `node` can write it.
RUN mkdir -p /app/data && chown node:node /app/data
# SITE_ORIGIN defaults to the origin the static pages were built for; keep them the same.
ENV NODE_ENV=production \
    PORT=5200 \
    DATABASE_URL=file:/app/data/shop.db \
    SITE_ORIGIN=${SITE_ORIGIN}
USER node
VOLUME ["/app/data"]
EXPOSE 5200
# `pnpm start` without pnpm: no package manager at runtime, and node is the process tini signals.
CMD ["node", "--import", "tsx", "src/server/prod.ts"]
