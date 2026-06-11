# GenMatrix NFT Generator

This is the independent latest-code version of the GenMatrix NFT Generator.

Future development should use this directory instead of the original `/Users/wolf/nft-generator` project.

## Commands

```bash
npm install
npm run dev
npm run build
```

## Structure

- `src/App.tsx` - GenMatrix site shell and NFT generator UI
- `src/main.tsx` - application entrypoint
- `src/security.ts` - production deployment guard
- `public/_headers` - static hosting security headers
- `dist/` - generated only after `npm run build`

Historical `App_*.tsx` files and old backup folders were intentionally not copied into this independent version.
