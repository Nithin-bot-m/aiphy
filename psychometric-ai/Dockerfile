# Psychometric AI API — production container.
# Multi-stage: deps → runtime (non-root, healthchecked).
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd -r psych && useradd -r -g psych psych
COPY --from=deps /app/node_modules ./node_modules
COPY backend ./backend
COPY docs ./docs
COPY README.md ./
RUN mkdir -p /app/data && chown -R psych:psych /app/data
USER psych
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/src/server.js"]
