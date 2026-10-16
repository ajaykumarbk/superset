# ── Stage 1: Build frontend ────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Install deps
COPY frontend/package*.json ./
RUN npm ci

# Copy source and build
COPY frontend/ ./
RUN npm run build
# Output: /app/frontend/dist


# ── Stage 2: Build backend ─────────────────────────────────────────
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# Install ALL deps (including devDeps needed for tsc)
COPY backend/package*.json ./
RUN npm ci

# Copy source and compile TypeScript
COPY backend/ ./
RUN npm run build
# Output: /app/backend/dist


# ── Stage 3: Production runtime ────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install only production deps
COPY backend/package*.json ./backend/
RUN npm ci --prefix backend --omit=dev

# Copy compiled backend
COPY --from=backend-builder /app/backend/dist ./backend/dist

# Copy built frontend into the location the backend expects:
# backend/src/index.ts: path.join(__dirname, '../../frontend/dist')
# __dirname at runtime = /app/backend/dist  →  ../../frontend/dist = /app/frontend/dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 3001

CMD ["node", "backend/dist/index.js"]
