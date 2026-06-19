# Virtual Buzzers with Firebase

Berean Board supports optional **Virtual buzzers** for remote play. Small group leaders do not create rooms, manage room codes, paste Firebase API keys, or configure Firebase. They enter the group/player names they already use, choose **Virtual**, show the QR code, and play.

## Overview of the UX

1. The leader sets up the group and confirms 1–4 players.
2. The leader chooses **In-person** or **Virtual** in the **In-person or Remote** setup step.
3. In-person mode preserves the normal physical-buzzer workflow and does not initialize Firebase.
4. Virtual mode signs the host in anonymously, creates a short-lived Firebase Realtime Database session, and displays a game-specific QR code plus fallback link.
5. Players scan the QR code, choose one of the leader-provided names, and receive the deterministic buzzer number/color for that player slot.
6. Berean Board opens, resets, disables, and closes virtual buzzers based on gameplay state.

## Firebase project setup — developer only

Small group leaders should never see this setup.

1. Create or choose the Firebase project used by Berean Board.
2. Enable **Realtime Database**.
3. Enable **Anonymous Authentication**.
4. Add a Firebase Web App and copy its public web config into `docs/firebase-config.js`.
5. Publish the Realtime Database Security Rules from `docs/developer-docs/virtual-buzzers-rtdb-rules.json`.
6. Configure **App Check** for the deployed web origins, then set `window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY` in `docs/firebase-config.js`.
7. Test locally from `docs/` with a simple static server.
8. Deploy to GitHub Pages.

## Important security notes

- Firebase config is public project identification. It is acceptable in browser code when restricted to Firebase services.
- Do **not** include Firebase service account private keys in the frontend.
- Authorization comes from Firebase Anonymous Authentication, Realtime Database Security Rules, App Check, constrained data paths, validation, and transactions.
- Sessions are short-lived and default to four hours.
- The app stores only virtual-buzzer state: player names, player claims, session status, buzz round, and first buzz. It does not store lesson content, questions, answers, or scores in Firebase.

## Local testing

From the repository root:

```bash
cd docs
python -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/small-group-review-game.html`, choose Virtual, and verify the QR/link opens `?mode=buzz&session=...` in a second browser/device.

## How leaders use it

- Enter group member names and select the 1–4 players from that group.
- Choose **Virtual** only when players need phones as buzzers.
- Ask players to scan the QR code and choose their own name.
- Wait until the connected-player list shows every player.
- Generate/play the game as usual.
- Berean Board shows the first buzz prominently in the player’s buzzer color.

## Cleanup

The host closes the virtual session when a player wins or when the leader clicks Start Over. Security rules reject player claims and first-buzz writes after a session is closed, and reject expired-session writes where practical. If a browser closes before cleanup, the short session lifetime limits stale data. A scheduled backend is intentionally not required for this static GitHub Pages app.
