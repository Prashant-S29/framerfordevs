# Builds the dependency-light TypeScript receiver and runs it as an unprivileged Node process.

FROM node:22.21.1-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tools/webhook-test-receiver/package.json ./tools/webhook-test-receiver/package.json
RUN pnpm install --filter @framerfordevs/webhook-test-receiver --frozen-lockfile --ignore-scripts
COPY tools/webhook-test-receiver/tsconfig.json tools/webhook-test-receiver/tsconfig.build.json ./tools/webhook-test-receiver/
COPY tools/webhook-test-receiver/src ./tools/webhook-test-receiver/src
RUN pnpm --filter @framerfordevs/webhook-test-receiver run build

FROM node:22.21.1-alpine AS runtime
ENV NODE_ENV=production \
    PORT=8787 \
    DATA_DIR=/app/data \
    SECRETS_DIR=/run/secrets/webhooks
WORKDIR /app
COPY --from=build --chown=node:node /workspace/tools/webhook-test-receiver/dist ./dist
RUN mkdir -p /app/data /run/secrets/webhooks && chown -R node:node /app/data /run/secrets/webhooks
USER node
EXPOSE 8787
VOLUME ["/app/data"]
CMD ["node", "dist/index.js"]
