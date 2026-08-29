FROM node:24-slim AS base
RUN npm install -g pnpm@10.25.0
WORKDIR /app
ENV SKIP_EFFECT_SOURCE_SETUP=1
ENV SKIP_ENV_VALIDATION=true

COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --store-dir /pnpm-store

ENV NODE_ENV=production
RUN pnpm --filter @framerfordevs/schema build && cd apps/server && pnpm run build
ENV SKIP_ENV_VALIDATION=
ENV SKIP_EFFECT_SOURCE_SETUP=

EXPOSE 3000

WORKDIR /app/apps/server
CMD ["node", "dist/index.mjs"]
