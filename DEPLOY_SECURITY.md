# Web Deployment Security

This project is a client-side Vite app. A browser must download JavaScript to run it, so client-side code cannot be made impossible to inspect. The current build hardening reduces accidental exposure and makes copied deployments harder to run, but true source confidentiality requires moving core generation logic to a backend service.

## Build

```bash
npm run build
```

Deploy the generated `dist/` directory.

## Security Controls Included

- Source maps are disabled in production.
- Production builds remove `console` and `debugger`.
- External CDN scripts were removed from `index.html`.
- CSP, referrer policy, permissions policy, frame blocking, and nosniff headers are included.
- Production runtime guard blocks:
  - direct `file://` opening,
  - non-HTTPS public access,
  - third-party iframe embedding,
  - unapproved domains when `VITE_ALLOWED_ORIGINS` is configured.

## Optional Domain Lock

Copy `.env.production.example` to `.env.production` and set your deployment origins:

```bash
VITE_ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com
```

Then rebuild:

```bash
npm run build
```

Only those exact origins will be allowed to run the app.

## Stronger Protection

For real code confidentiality, move valuable algorithms, license checks, project export signing, or paid features to a backend API. Keep only UI and low-value rendering code in the browser.
