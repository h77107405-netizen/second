# Authentication Flow

## Login flow
1. User submits email and password from the login page.
2. The frontend sends a POST request to /api/auth/login.
3. The backend validates credentials, checks the user role, and issues a JWT.
4. The frontend stores the token securely in session/local storage and updates the auth context.
5. The user is redirected to the correct dashboard based on role.

## Logout flow
1. The user clicks Logout.
2. The frontend clears all auth storage keys and resets the auth state.
3. The browser is redirected to /login using replace navigation.
4. Protected routes re-check authentication and block access.

## JWT lifecycle
- Access token is validated on protected API requests.
- Expired or invalid tokens cause a 401 response.
- A refresh flow can be used when available to reissue a token.

## Route protection
- /student/* requires the student role.
- /teacher/* requires the teacher role.
- /admin/* requires the admin role.
- Unauthenticated users are redirected to /login.
- Role mismatches are redirected to an unauthorized state.

## Role-based authorization
- Students can only access student routes.
- Teachers can only access teacher routes.
- Admins can only access admin routes.
