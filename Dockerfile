FROM node:22-alpine AS base
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/delivery/package.json packages/delivery/
COPY packages/backend/package.json packages/backend/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/delivery/ packages/delivery/
COPY packages/backend/ packages/backend/
RUN pnpm --filter @event-radar/shared build
RUN pnpm --filter @event-radar/delivery build
RUN pnpm --filter @event-radar/backend build

FROM base AS runner
WORKDIR /app

# Chromium + deps for Playwright/Crawlee (truth-social scanner etc.)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-cjk \
  && rm -rf /var/cache/apk/*

# Tell Playwright to use the system Chromium instead of downloading its own
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist/ packages/shared/dist/
COPY --from=build /app/packages/delivery/package.json packages/delivery/package.json
COPY --from=build /app/packages/delivery/dist/ packages/delivery/dist/
COPY --from=build /app/packages/backend/package.json packages/backend/package.json
COPY --from=build /app/packages/backend/dist/ packages/backend/dist/
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/packages/shared/node_modules/ packages/shared/node_modules/
COPY --from=build /app/packages/delivery/node_modules/ packages/delivery/node_modules/
COPY --from=build /app/packages/backend/node_modules/ packages/backend/node_modules/
EXPOSE 3001
CMD ["node", "packages/backend/dist/index.js"]
