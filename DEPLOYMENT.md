# Deployment Guide

## Production setup
1. Copy .env.example to .env and fill in production values.
2. Provision a PostgreSQL database and set DATABASE_URL.
3. Set strong JWT secrets and session secrets.
4. Build the frontend and backend.

## Required environment variables
- DATABASE_URL
- JWT_SECRET
- JWT_REFRESH_SECRET
- JWT_EXPIRES_IN
- JWT_REFRESH_EXPIRES_IN
- SESSION_SECRET
- CORS_ORIGIN
- VITE_API_URL

## Database setup
- Run the schema migrations or initialize the tables before the first production launch.
- Ensure indexes exist for users, roles, and auth-related lookups.

## Build steps
- pnpm install
- pnpm build

## Deployment steps
- Deploy the backend and frontend separately.
- Point VITE_API_URL at the deployed backend API.
- Ensure HTTPS is enabled and cookies are served over secure origins.
