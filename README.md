## Peeksee — Local-First Static Site with Admin Helper

This repository is a minimal static site with an optional Express helper server for admin and Stripe Checkout support.

## Quick start (local)

1. Install dependencies:

```bash
cd /c/Users/12158/Desktop/WebBook
npm install
```

2. Configure environment variables (create a `.env` file in the project root):

```
# Optional: Stripe (if you want Checkout sessions)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
PRICE_ID=price_...

# Admin token (recommended for secure admin)
ADMIN_TOKEN=your-strong-admin-token

# Session secret for express-session
SESSION_SECRET=some-long-random-secret
```

3. Start the server:

```bash
npm start
```

4. Visit the site:

- Public pages: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin.html` (paste your `ADMIN_TOKEN` in the login field to authenticate)

## How admin authentication works

- If `ADMIN_TOKEN` is set on the server, the server requires it for admin actions. The admin login form posts the token to `/admin-login`; on success the server sets a session cookie (via `express-session`).
- The client still supports a fallback local passphrase (stored hashed in `localStorage`) so you can operate in dev mode without a server token.

## Recommended production setup

- Use HTTPS in production. Set `cookie.secure` to `true` in `server.js` when behind TLS.
- Keep `SESSION_SECRET` and `ADMIN_TOKEN` private and rotate them periodically.
- For multi-admin setups or stronger security, replace the single-token model with a user store and proper authentication (password hashes, session store like Redis).

## Admin UI features

- List / export / delete uploads and contacts.
- Mark uploads as `featured` from the admin UI — featured items surface on the Home page.
- Toggle the per-upload $1 charge for non-subscribers.

## Files of interest

- `index.html`, `upload.html`, `admin.html` — client pages
- `script.js` — client logic (IndexedDB, rendering, admin interactions)
- `style.css` — styling and theming
- `server.js` — Express helper server (admin login, Stripe helper, contact logging)

## Security notes

- The single-token model is simple and effective for small private deployments. For public-facing sites, prefer a proper auth mechanism backed by server-side session management and HTTPS.

If you'd like, I can help switch to a full username/password admin flow using `express-session` and a simple JSON user store, or integrate OAuth for admin access.
