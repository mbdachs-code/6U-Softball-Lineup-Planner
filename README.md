# Softball Lineup Fairness Planner

Shareable browser app for printable softball lineup packets, attendance-aware game planning, and season fairness tracking.

## Main Features

- Team name plus two editable brand colors for each team
- Full saved roster with game-day attendance checkboxes
- Printable packet with coach reference page, batting-order page, and inning field cards
- Season fairness tracking with save and undo
- Save only the innings actually played
- Export/import of roster, branding, and season data between devices

## iPad / iPhone App Mode

After publishing, coaches can install it like an app:

1. Open the site in Safari.
2. Tap `Share`.
3. Tap `Add to Home Screen`.
4. Open the installed app once while online so the offline cache is ready.

The service worker in `sw.js` lets the app keep working without internet after the first successful load.

## Sharing Data

- `Export data` creates one JSON file with roster, branding, and season stats.
- `Import data` restores that file on another device or browser.

## Notes

- All data is stored in the browser unless you export it.
- Printing from Chrome works best with `Headers and Footers` turned off.
