FROM node:24-slim AS base
RUN npm install -g pnpm@10.25.0
WORKDIR /app
ENV SKIP_EFFECT_SOURCE_SETUP=1
ENV SKIP_ENV_VALIDATION=true

COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --store-dir /pnpm-store

ENV NODE_ENV=production
RUN cd apps/worker && pnpm run build
ENV SKIP_ENV_VALIDATION=
ENV SKIP_EFFECT_SOURCE_SETUP=

WORKDIR /app/apps/worker
CMD ["node", "dist/index.mjs"]
