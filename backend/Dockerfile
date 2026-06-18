FROM node:20-alpine AS backend

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./
COPY frontend/ /app/frontend/

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000 3001

CMD ["node", "dist/app.js"]
