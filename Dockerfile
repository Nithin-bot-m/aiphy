# Next.js product frontend — production container (standalone from source).
# Build context is the repository root that contains src/, package.json, next.config.ts.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* bun.lock* ./
RUN npm install --no-audit --no-fund

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The frontend proxies /api/* to PSYCHOMETRIC_BACKEND_URL (set at RUNTIME too).
RUN npm run build || npx next build

FROM node:24-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN groupadd -r nextjs && useradd -r -g nextjs nextjs
COPY --from=build /app /app
RUN chown -R nextjs:nextjs /app
USER nextjs
EXPOSE 3000
# The standalone server honours $PORT (Render/Railway set it automatically;
# defaults to 3000 for plain docker/compose).
CMD ["sh", "-c", "node .next/standalone/server.js"]
