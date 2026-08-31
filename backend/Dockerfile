FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend-react
COPY frontend-react/package*.json ./
RUN npm ci
COPY frontend-react/ ./
RUN npm run build

FROM node:20-alpine AS backend-builder

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime

ENV NODE_ENV=production \
    TZ=America/Lima

WORKDIR /app/backend
COPY --from=backend-builder --chown=node:node /app/backend/package*.json ./
COPY --from=backend-builder --chown=node:node /app/backend/node_modules ./node_modules
COPY --from=backend-builder --chown=node:node /app/backend/dist ./dist
COPY --from=backend-builder --chown=node:node /app/backend/migrations ./migrations
COPY --from=frontend-builder --chown=node:node /app/frontend-react/dist /app/frontend-react/dist

RUN mkdir -p \
      /app/backend/storage/rrhh/profile-photos \
      /app/backend/storage/users/profile-photos \
      /app/backend/private-storage/rrhh-evidence \
      /app/backend/private-storage/rrhh-overtime \
      /app/backend/private-storage/rrhh-permissions \
    && chown -R node:node /app/backend/storage /app/backend/private-storage

USER node
EXPOSE 3000 3001

CMD ["node", "dist/app.js"]
