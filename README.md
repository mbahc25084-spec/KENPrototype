# The Slot Agent

An offline, high-fidelity prototype for authority-aware coordination: it finds fast-moving opportunities but only executes decisions that were safely delegated in advance.

## Run locally

This is dependency-free static HTML. Open `index.html` in a browser, or serve the directory with any static web server. It makes no network requests.

## Publish to GitHub Pages

1. Create a new GitHub repository and push this folder to its `main` branch.
2. In GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**.
3. Select `main` and the repository root, then save.

The published app is available at `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.

## Prototype controls

- **Start demo**: four-field mission setup → authority map → watch loop.
- **Judge mode**: select any deterministic scenario S1–S10, or press `1`–`9` / `0` for S10.
- **Authority Lab**: change ownership, consent, identity mapping, reachability, timing, fare, and budget; use the five attack presets to pressure-test the decision.
- **Agent Brain**: inspect the append-only audit trace and scrub back through the same events that produce the mission state.
- **Decision Receipt**: see who decided each part of a completed fixture booking and which recorded authority applied.
- **Trust surfaces**: explore clearly-labelled simulated fixture comparisons, the interruption curve, and Envelope Studio coverage.

Honesty layer: the policy engine and trace are `LOCAL`; inventory, delivery, payments, identity and confirmation are explicitly `SIMULATED`. There are no real integrations.
