# 3DGS Pro Viewer

A lightweight React + Vite viewer for `.splat` and `.ply` Gaussian Splatting files, with FPS-style navigation, pointer-lock interaction, local file loading, and a technical HUD.

## Features

- Load remote default `.splat` scene
- Upload local `.splat` or `.ply` files in the browser
- FPS-style movement: `W A S D`
- Vertical movement: `Q / E` or `Space / Ctrl`
- Speed boost: `Shift`
- Pointer lock viewport interaction
- GitHub Pages deployment workflow included

## Local development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Quality check

```bash
npm run lint
npm run build
```

## GitHub Pages deployment

This repo includes `.github/workflows/deploy.yml`.

1. Push the project to a GitHub repository.
2. Go to **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. Push to the `main` branch.
5. The workflow builds the `dist` folder and publishes it to GitHub Pages.

## Supported files

- `.splat`
- `.ply`

Large 3DGS files may be limited by browser memory, GPU capability, and mobile device constraints.

## Notes

This is a static front-end app. It does not require Gemini API keys, Express, or a backend server.
