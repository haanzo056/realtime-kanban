FROM node:20-slim

# prisma's query engine needs openssl
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter server... build

WORKDIR /app/apps/server
ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/index.js"]
