# Admin Dashboard Architecture

## Goal
Provide a secure operations surface for launch-critical controls:
- monitor liabilities and transaction flow
- manage provably-fair commitment pool
- recover stuck withdrawals

## Components

### 1. Admin Auth Layer (`src/lib/admin/auth.ts`)
- Uses `ADMIN_USERNAME` + `ADMIN_PASSWORD` for login
- Creates signed admin session tokens using HMAC-SHA256 (`ADMIN_SESSION_SECRET`)
- Stores session in HttpOnly cookie: `zcashino_admin_session`
- Exposes `requireAdmin(request)` guard for protected API routes
- Enforces stronger credential rules in production:
  - password >= 12 chars
  - session secret >= 32 chars

### 2. Admin Auth API (`/api/admin/auth`)
- `GET`: checks whether current cookie is valid
- `POST`: validates credentials and issues session cookie
- `DELETE`: clears session cookie

### 3. Admin Metrics API (`/api/admin/overview`)
- Protected by `requireAdmin`
- Rate-limited by IP (`admin-read` bucket)
- Aggregates:
  - platform totals (liabilities, deposits, withdrawals, wagering)
  - transaction counters (pending/failed withdrawals, confirmed volume)
  - infrastructure status (node + commitment pool)
  - pending withdrawals list for ops triage
  - security counters (failed logins, rate-limited events)
  - recent admin audit events

### 4. Admin Action API (`/api/admin/pool`)
- Existing operational endpoint, now protected by `requireAdmin`
- Rate-limited by IP (`admin-action` bucket)
- Supports:
  - `refill`
  - `cleanup`
  - `init`
  - `process-withdrawals`

### 5. Admin UI (`/admin`)
- Login screen if unauthenticated
- Metrics dashboard if authenticated
- Manual refresh + auto-refresh polling
- One-click action panel for pool/withdrawal operations
- Pending withdrawals table for incident handling
- Security panel for recent audit logs + attack indicators

### 6. Admin Audit Logging (`AdminAuditLog`)
- Every admin auth/overview/pool event is logged with:
  - action
  - actor
  - success/failure
  - IP
  - route/method
  - details/metadata

## Security Model (current)
- Browser never stores plaintext credentials after login
- Auth state is server-validated from signed cookie
- Admin API routes are inaccessible without valid admin cookie

## Future Hardening
- IP allow-list and rate limiting for `/api/admin/*`
- MFA (TOTP or hardware key)
- Audit log table for every admin action
- Role-based admin permissions instead of single shared admin role
