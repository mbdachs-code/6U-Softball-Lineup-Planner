# Softball Lineup Fairness Planner

Shareable browser app for printable softball lineup packets, attendance-aware game planning, and season fairness tracking.

## Main Features

- Team name plus two editable brand colors for each team
- Full saved roster with game-day attendance checkboxes
- Printable packet with coach reference page, batting-order page, and inning field cards
- Season fairness tracking with save and undo
- Save only the innings actually played
- Export/import of roster, branding, and season data between devices

## Local Use

1. Open [index.html](/Users/michaeldachs/Documents/New%20project/index.html) in Chrome or Safari.
2. Set team name and colors.
3. Save the roster.
4. Check the players attending that game.
5. Generate, print, and save the game after it is played.

Coach instructions are also available in [coach-instructions.html](/Users/michaeldachs/Documents/New%20project/coach-instructions.html).

## GitHub Pages

This folder is ready for GitHub Pages as a static site.

1. Create a new GitHub repository.
2. Upload all files in this folder.
3. In GitHub, open `Settings` > `Pages`.
4. Set the source to `Deploy from a branch`.
5. Choose the `main` branch and the `/ (root)` folder.
6. Save, then wait for the site URL to appear.

The included `.nojekyll` file helps GitHub Pages serve the site exactly as a plain static app.

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
