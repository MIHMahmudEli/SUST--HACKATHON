# --- Stage 1: build ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# --- Stage 2: runtime (small image, prod deps only) ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 8000
# Bind handled in main.ts (0.0.0.0). Secrets passed via --env-file / platform env vars.
CMD ["node", "dist/main.js"]
