# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/
COPY apps/api/ apps/api/
# pnpm blocks postinstall hooks, so prisma generate must be explicit
RUN pnpm --filter @assign/db db:generate && pnpm -r build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod

COPY packages/db/prisma packages/db/prisma/
RUN pnpm --filter @assign/db db:generate

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/apps/api/dist apps/api/dist

USER node
EXPOSE 4000
HEALTHCHECK --interval=5s --timeout=3s --retries=12 \
  CMD wget -qO- http://127.0.0.1:4000/healthz || exit 1

WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]
