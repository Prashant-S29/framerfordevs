FROM node:24-slim AS builder
RUN npm install -g pnpm@10.25.0
WORKDIR /app
ENV SKIP_EFFECT_SOURCE_SETUP=1
ENV SKIP_ENV_VALIDATION=true

COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --store-dir /pnpm-store

ENV NODE_ENV=production
RUN pnpm --filter @framerfordevs/schema build && cd apps/server && pnpm run build
RUN pnpm --filter server deploy --prod --legacy /runtime \
  && cp -R apps/server/dist /runtime/dist \
  && node scripts/prune-production-image.mjs /runtime

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /runtime /app

EXPOSE 3000
CMD ["node", "dist/index.mjs"]
