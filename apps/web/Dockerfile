FROM node:24-slim AS base
RUN npm install -g pnpm@10.25.0
WORKDIR /app
ENV SKIP_EFFECT_SOURCE_SETUP=1
ENV SKIP_ENV_VALIDATION=true

COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --store-dir /pnpm-store

ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
ENV NODE_ENV=production
RUN cd apps/web && pnpm run build
ENV SKIP_ENV_VALIDATION=
ENV SKIP_EFFECT_SOURCE_SETUP=

ENV HOST=0.0.0.0
ENV PORT=3001
EXPOSE 3001

# SSR chunks require() externals at runtime; must run from the workspace
WORKDIR /app/apps/web
CMD ["node", ".output/server/index.mjs"]
