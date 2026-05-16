# Golf PWA Starter

## Run locally

```bash
npm install
npm run dev
```

## Build for production

```bash
npm run build
npm run preview
```

## Friend testing deployment

Deploy the project to Netlify for friend testing.

Netlify settings:

```txt
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
```

Add `OPENAI_API_KEY` in the Netlify dashboard under environment variables. Do not commit the API key to the repo.

After deploy, share the deployed Netlify URL with testers. Each tester's rounds and custom course layouts are stored locally in their own browser on their own device. They should use the in-app Export JSON button before clearing browser storage, switching devices, or reinstalling the app.

The project also includes `netlify.toml` with the expected build settings:

```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"
```

## What is included
- Vite + React starter
- PWA support via `vite-plugin-pwa`
- Top tabs for Log round / History / Stats
- Local persistence with `localStorage`
- Round save flow
- Installable app shell

## What to build next
- Real voice recording
- Speech-to-text
- Automatic parsing
- Better charts
- Course and tee data

Structured parser added: enter one hole per line in the format `hole,par,tee,approach_miss,up_and_down,putts,first_putt_ft,score`.
