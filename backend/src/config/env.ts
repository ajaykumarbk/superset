// backend/src/config/env.ts
// Centralised environment variable access with typed defaults.
// Values are read from .env (loaded by dotenv/config in index.ts).

export const ENV = {
  PORT:           parseInt(process.env.PORT           || '3001', 10),
  NODE_ENV:       process.env.NODE_ENV                || 'development',
  SESSION_SECRET: process.env.SESSION_SECRET          || 'superset-local-dev-secret-key-change-me',

  // PostgreSQL – defaults match docker-compose.yml for local dev
  DB_HOST:        process.env.DB_HOST                 || 'localhost',
  DB_PORT:        parseInt(process.env.DB_PORT        || '5432', 10),
  DB_USER:        process.env.DB_USER                 || 'superset',
  DB_DATABASE:    process.env.DB_DATABASE             || 'superset_db',
  DB_PASSWORD:    process.env.DB_PASSWORD             || 'superset_local_pw',
} as const;
