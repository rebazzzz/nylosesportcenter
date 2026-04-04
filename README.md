# Nylose SportCenter

Full-stack club site with a public frontend, admin dashboard, SQLite-backed API, and member registration.

## What Changed

- Cookie-based auth instead of storing JWTs in `localStorage`
- Bootstrap admin is no longer hardcoded to `admin123`
- Centralized request validation with `zod`
- Backend package upgrades for `multer`, `nodemailer`, and `sqlite3`
- Added backend smoke tests with `supertest`
- Added `backend/.env.example` and a root `Dockerfile`

## Local Run

1. Install root tooling:
```bash
npm install
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Create `backend/.env` from `backend/.env.example`

4. Set a strong `JWT_SECRET` and bootstrap admin credentials:
```env
JWT_SECRET=replace-with-a-long-random-secret-at-least-32-characters
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=replace-with-a-strong-admin-password
```

5. Start the app:
```bash
cd backend
npm start
```

6. Open:
- App: `http://localhost:3001`
- Health: `http://localhost:3001/api/health`

## Tests

Run backend tests:
```bash
cd backend
npm test
```

## Production Notes

- The backend serves the frontend, so one Node service is enough
- Auth cookie is `HttpOnly` and `SameSite=Lax`
- Set `PUBLIC_APP_URL` and `FRONTEND_URL` to your deployed origin
- For container deploys, the included [Dockerfile](./Dockerfile) runs the full app

## Remaining Risks

- `npm audit` is improved but may still report transitive Express 4 issues until a broader Express 5 migration is completed
- SQLite is fine for small deployments, but PostgreSQL would be the better next step for higher concurrency and operational growth
