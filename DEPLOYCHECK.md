<<<<<<< HEAD
# Deployment checklist for Surigao Fire Watch

This file is for local project planning only. It is not meant to be uploaded to the public deployment platform or used as app content.

## 1) Repository and build

- [ ] Push the repo to GitHub
- [ ] Ensure Node dependencies are installed:
  - `npm install`
- [ ] Verify production build succeeds:
  - `npm run build`
- [ ] Confirm no local-only code is still left in the repo

## 2) Frontend deploy to Vercel

- [ ] Import the GitHub repo in Vercel
- [ ] Use framework preset: Vite
- [ ] Build command: `npm run build`
- [ ] Output directory: `dist`
- [ ] Do not run `npm install` manually inside Vercel; Vercel installs dependencies automatically during build
- [ ] Do not run `npm run dev` on the deployment host; that is only for local development
- [ ] Confirm the deployment loads without 404s or broken asset paths
- [ ] Confirm the map loads and the app renders correctly

## 3) Firebase configuration for live app data

- [ ] Create a Firebase project
- [ ] Add a Realtime Database
- [ ] Copy values from Firebase console to Vercel environment variables
- [ ] Add the env vars from `.env.example` to Vercel:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_DATABASE_URL`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_APP_ID`
- [ ] If env vars are blank, the app will stay in sample/in-memory mode

## 4) Firebase database rules

- [ ] Set read/write rules for reports
- [ ] Allow read access for live app display
- [ ] Restrict write access before public launch if needed
- [ ] Optionally enable `airQualitySignals` and `postApprovals` read access

Example starting point:

```json
{
  "rules": {
    "reports": { ".read": true, ".write": true },
    "airQualitySignals": { ".read": true, ".write": false },
    "postApprovals": { ".read": true, ".write": true }
  }
}
```

## 5) Optional Firebase Functions deploy

Only do this if you want the server-side background processing enabled.

- [ ] Go to the `functions/` folder
- [ ] Run:
  - `cd functions`
  - `npm install`
- [ ] Deploy the backend:
  - `firebase deploy --only functions`

This repo no longer includes the Facebook polling workflow, so the function deploy is only for the remaining backend tasks such as any scheduled jobs you intentionally keep.

## 6) Public launch checks

- [ ] App loads successfully on desktop and mobile
- [ ] Map is visible and usable
- [ ] User can submit a report
- [ ] Reports appear in the app UI
- [ ] Fire alert triage still works in live mode
- [ ] Weather data loads without breaking the page
- [ ] Thermal data fails gracefully if unavailable
- [ ] No local-only demo state appears in the public build
- [ ] App clearly states it is informational, not an official emergency dispatch system

## 7) Final safety and trust checks

- [ ] Add a disclaimer if this is not an official response system
- [ ] Make sure users know to call the Bureau of Fire Protection for emergency response
- [ ] Review any public messaging before launch
- [ ] verify there are no accidental public-facing instructions in deployment settings
- [ ] Keep this checklist local only; do not upload it to the deployment host

## 8) Launch command summary

Frontend deploy in Vercel:

- Push the repo to GitHub
- Import the repo in Vercel
- Keep the framework preset as Vite
- Use build command: `npm run build`
- Set output directory: `dist`
- Vercel will run `npm install` automatically for you

Do not run these commands inside the deployment host:

```bash
npm install
npm run dev
```

Optional backend deploy:

```bash
cd functions
npm install
firebase deploy --only functions
```

## Notes

- If Firebase env values are blank, the app falls back to sample data.
- This file is intentionally kept private and local.
- Do not publish this file to Vercel, GitHub Pages, or any public hosting platform unless you intentionally want the checklist visible.
=======
# Deployment checklist for Surigao Fire Watch

This file is for local project planning only. It is not meant to be uploaded to the public deployment platform or used as app content.

## 1) Repository and build

- [ ] Push the repo to GitHub
- [ ] Ensure Node dependencies are installed:
  - `npm install`
- [ ] Verify production build succeeds:
  - `npm run build`
- [ ] Confirm no local-only code is still left in the repo

## 2) Frontend deploy to Vercel

- [ ] Import the GitHub repo in Vercel
- [ ] Use framework preset: Vite
- [ ] Build command: `npm run build`
- [ ] Output directory: `dist`
- [ ] Do not run `npm install` manually inside Vercel; Vercel installs dependencies automatically during build
- [ ] Do not run `npm run dev` on the deployment host; that is only for local development
- [ ] Confirm the deployment loads without 404s or broken asset paths
- [ ] Confirm the map loads and the app renders correctly

## 3) Firebase configuration for live app data

- [ ] Create a Firebase project
- [ ] Add a Realtime Database
- [ ] Copy values from Firebase console to Vercel environment variables
- [ ] Add the env vars from `.env.example` to Vercel:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_DATABASE_URL`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_APP_ID`
- [ ] If env vars are blank, the app will stay in sample/in-memory mode

## 4) Firebase database rules

- [ ] Set read/write rules for reports
- [ ] Allow read access for live app display
- [ ] Restrict write access before public launch if needed
- [ ] Optionally enable `airQualitySignals` and `postApprovals` read access

Example starting point:

```json
{
  "rules": {
    "reports": { ".read": true, ".write": true },
    "airQualitySignals": { ".read": true, ".write": false },
    "postApprovals": { ".read": true, ".write": true }
  }
}
```

## 5) Optional Firebase Functions deploy

Only do this if you want the server-side background processing enabled.

- [ ] Go to the `functions/` folder
- [ ] Run:
  - `cd functions`
  - `npm install`
- [ ] Deploy the backend:
  - `firebase deploy --only functions`

This repo no longer includes the Facebook polling workflow, so the function deploy is only for the remaining backend tasks such as any scheduled jobs you intentionally keep.

## 6) Public launch checks

- [ ] App loads successfully on desktop and mobile
- [ ] Map is visible and usable
- [ ] User can submit a report
- [ ] Reports appear in the app UI
- [ ] Fire alert triage still works in live mode
- [ ] Weather data loads without breaking the page
- [ ] Thermal data fails gracefully if unavailable
- [ ] No local-only demo state appears in the public build
- [ ] App clearly states it is informational, not an official emergency dispatch system

## 7) Final safety and trust checks

- [ ] Add a disclaimer if this is not an official response system
- [ ] Make sure users know to call the Bureau of Fire Protection for emergency response
- [ ] Review any public messaging before launch
- [ ] verify there are no accidental public-facing instructions in deployment settings
- [ ] Keep this checklist local only; do not upload it to the deployment host

## 8) Launch command summary

Frontend deploy in Vercel:

- Push the repo to GitHub
- Import the repo in Vercel
- Keep the framework preset as Vite
- Use build command: `npm run build`
- Set output directory: `dist`
- Vercel will run `npm install` automatically for you

Do not run these commands inside the deployment host:

```bash
npm install
npm run dev
```

Optional backend deploy:

```bash
cd functions
npm install
firebase deploy --only functions
```

## Notes

- If Firebase env values are blank, the app falls back to sample data.
- This file is intentionally kept private and local.
- Do not publish this file to Vercel, GitHub Pages, or any public hosting platform unless you intentionally want the checklist visible.
>>>>>>> 0e2e45c (Initial project setup)
