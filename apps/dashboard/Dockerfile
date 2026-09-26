FROM node:24-slim AS builder
RUN npm install -g pnpm@10.25.0
WORKDIR /app
ENV SKIP_EFFECT_SOURCE_SETUP=1
ENV SKIP_ENV_VALIDATION=true

COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --store-dir /pnpm-store

ARG INTERNAL_SERVER_URL
ARG VITE_DASHBOARD_ORIGIN
ARG VITE_DEVELOPER_ORIGIN
ARG VITE_MARKETING_ORIGIN
ENV INTERNAL_SERVER_URL=${INTERNAL_SERVER_URL}
ENV VITE_DASHBOARD_ORIGIN=${VITE_DASHBOARD_ORIGIN}
ENV VITE_DEVELOPER_ORIGIN=${VITE_DEVELOPER_ORIGIN}
ENV VITE_MARKETING_ORIGIN=${VITE_MARKETING_ORIGIN}
ENV NODE_ENV=production
ENV SKIP_ENV_VALIDATION=
RUN test -n "$INTERNAL_SERVER_URL" \
  && test -n "$VITE_DASHBOARD_ORIGIN" \
  && test -n "$VITE_DEVELOPER_ORIGIN" \
  && test -n "$VITE_MARKETING_ORIGIN" \
  && cd apps/dashboard \
  && pnpm run build
RUN pnpm --filter dashboard deploy --prod --legacy /runtime \
  && cp -R apps/dashboard/.output /runtime/.output \
  && node scripts/prune-production-image.mjs /runtime

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
COPY --from=builder /runtime /app

EXPOSE 3001
CMD ["node", ".output/server/index.mjs"]
