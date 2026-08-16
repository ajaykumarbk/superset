// backend/src/config/env.ts
// Centralised environment variable access with typed defaults.

export const ENV = {
  PORT:           parseInt(process.env.PORT           || '3001', 10),
  NODE_ENV:       process.env.NODE_ENV                || 'development',
  SESSION_SECRET: process.env.SESSION_SECRET          || 'superset-secret-key-change-me-in-production',

  DB_HOST:        process.env.DB_HOST                 || '129.159.233.130',
  DB_PORT:        parseInt(process.env.DB_PORT        || '5432', 10),
  DB_USER:        process.env.DB_USER                 || 'myuser',
  DB_DATABASE:    process.env.DB_DATABASE             || 'mydb',
  DB_PASSWORD:    process.env.DB_PASSWORD             || 'mypassword',
} as const;
