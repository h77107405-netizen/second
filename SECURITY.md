# Security Notes

## Improvements implemented
- Centralized auth state reset on logout.
- Replace-based redirects to prevent browser history access to protected pages.
- Route-level role checks for admin, teacher, and student areas.
- Environment variables moved to .env.example for configuration.
- Backend auth endpoints now validate tokens and roles consistently.

## Recommended next steps
- Move to httpOnly secure cookies for production token storage.
- Add CSRF protection for cookie-based sessions.
- Add refresh token rotation and session revocation tables.
- Add rate limiting and audit logging for auth actions.
