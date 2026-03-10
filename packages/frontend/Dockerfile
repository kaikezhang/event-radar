FROM node:22-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules/ node_modules/
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/frontend/ packages/frontend/

# Build shared first
RUN pnpm --filter @event-radar/shared build

# Build frontend
WORKDIR /app/packages/frontend
RUN pnpm build

FROM base AS runner
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/packages/frontend/package.json /app/packages/frontend/
COPY --from=builder /app/packages/frontend/public /app/packages/frontend/public
COPY --from=builder /app/packages/frontend/.next /app/packages/frontend/.next
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared /app/packages/shared

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "/app/packages/frontend/server.js"]
