FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
# Add required build tools for native addons (e.g. napi-rs/canvas, prisma)
RUN apk add --no-cache python3 make g++ 
WORKDIR /app
COPY . .
# Install all dependencies required for building
RUN pnpm install --frozen-lockfile
# Generate Prisma Client
RUN pnpm --filter @dentpilot/api prisma:generate
# Build API and its dependencies (application, domain, contracts)
RUN pnpm --filter @dentpilot/api... build
# Deploy isolated production environment
RUN pnpm --filter @dentpilot/api --prod deploy pruned

FROM base AS production
WORKDIR /app
# Run as secure non-root user
USER node
ENV NODE_ENV=production
ENV PORT=3000
# Copy the pruned directory from the builder
COPY --from=builder --chown=node:node /app/pruned ./

# Re-generate Prisma Client inside the production folder to ensure engine binaries are correctly linked for alpine
RUN npx prisma generate

EXPOSE 3000
CMD [ "node", "dist/main.js" ]
