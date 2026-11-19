FROM node:22-bookworm AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY contract/package.json ./contract/package.json
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci

COPY . .
RUN npm run contract:compile \
 && npm run generate \
 && npm run build \
 && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/booking.db

WORKDIR /app

RUN mkdir -p /data && chown node:node /data

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/contract/package.json ./contract/package.json
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/frontend/package.json ./frontend/package.json

USER node

EXPOSE 3000

CMD ["node", "backend/dist/index.js"]
