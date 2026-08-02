# Pac-Man 🟡

A complete, browser-based **Pac-Man** game built with plain HTML5 Canvas and
JavaScript — no frameworks, no build step, no server. Just open it and play.

## Play

- **Move:** Arrow keys or **WASD**
- **Mobile:** swipe on the board, or use the on-screen D-pad
- **Goal:** eat every pellet to clear the level
- **Power pellets** (the big dots in the corners) turn the ghosts blue — chase
  and eat them for bonus points before they recover
- You have **3 lives**; touching a normal ghost costs one

The four ghosts each hunt you differently (the classic Blinky / Pinky / Inky /
Clyde behaviours), and they alternate between *scatter* and *chase* phases.
Your best score is saved in your browser.

## Run it locally

Because it's a static site, any of these works:

```bash
# Option 1: just open the file
open index.html          # macOS  (or double-click it)

# Option 2: serve it (recommended, avoids browser file:// quirks)
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy it to the whole world (GitHub Pages)

This repo ships with a GitHub Actions workflow
(`.github/workflows/deploy.yml`) that publishes the game to **GitHub Pages**.

One-time setup:

1. In the repository, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

That's it. Every push to `main` (or this feature branch) runs the workflow and
deploys the game. Your public URL will be:

```
https://<your-username>.github.io/<repository-name>/
```

You can also trigger a deploy manually from the **Actions** tab
("Deploy Pac-Man to GitHub Pages" → **Run workflow**).

## Files

| File                          | Purpose                                  |
| ----------------------------- | ---------------------------------------- |
| `index.html`                  | Page markup, HUD, and touch controls     |
| `style.css`                   | Retro arcade styling, responsive layout  |
| `game.js`                     | Maze, movement, ghost AI, scoring, loop  |
| `.github/workflows/deploy.yml`| Auto-deploy to GitHub Pages              |
