# Build instructions

Six favicon files have been added directly into the `landing-page` folder (same level as `index.html`): `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`.

Add the following inside the `<head>` of `landing-page/index.html`, if a `<head>` section with meta tags already exists, add these alongside it rather than replacing anything:

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32">
<link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192">
```

Confirm the paths resolve correctly given this project's actual folder structure and how Vercel is serving it (root directory is already set to `landing-page`, so root-relative paths like `/favicon.ico` should point correctly at these files, but verify rather than assume).
