FROM node:22-alpine AS base
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/
RUN pnpm --filter @event-radar/shared build
RUN pnpm --filter @event-radar/backend build

FROM base AS runner
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/shared/package.json /app/packages/shared/dist/ packages/shared/
COPY --from=build /app/packages/backend/package.json /app/packages/backend/dist/ packages/backend/
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/packages/shared/node_modules/ packages/shared/node_modules/
COPY --from=build /app/packages/backend/node_modules/ packages/backend/node_modules/
EXPOSE 3001
CMD ["node", "packages/backend/dist/index.js"]
