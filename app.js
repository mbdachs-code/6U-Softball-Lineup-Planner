const STORAGE_KEY = "softball-lineup-fairness-season";
const ROSTER_STORAGE_KEY = "softball-lineup-fairness-roster";
const APP_RELEASES = Array.isArray(window.SOFTBALL_PLANNER_RELEASES) ? window.SOFTBALL_PLANNER_RELEASES : [];
const CURRENT_RELEASE = APP_RELEASES[0] || null;
const APP_VERSION =
  CURRENT_RELEASE?.version || (APP_RELEASES.length ? `v1.${APP_RELEASES.length}.0` : "v1.0.0");
const DEFAULT_BRANDING = {
  primaryColor: "#0f56c7",
  secondaryColor: "#ff3ca6",
};
const INFIELD_POSITIONS = ["P", "1B", "2B", "SS", "3B"];
const KEY_POSITIONS = ["P", "1B", "SS", "3B"];
const POSITION_LABELS = {
  P: "Pitcher",
  "1B": "1st Base",
  "2B": "2nd Base",
  SS: "Shortstop",
  "3B": "3rd Base",
};

const sampleRoster = [
  "Ava",
  "Bella",
  "Chloe",
  "Daisy",
  "Ella",
  "Faith",
  "Grace",
  "Harper",
  "Ivy",
  "Josie",
  "Kinsley",
  "Lila",
];

const state = {
  latestGame: null,
  attendanceByPlayer: {},
};

const MAX_UNDO_HISTORY = 20;

const elements = {
  rosterInput: document.querySelector("#roster-input"),
  attendanceList: document.querySelector("#attendance-list"),
  teamName: document.querySelector("#team-name"),
  primaryColor: document.querySelector("#primary-color"),
  secondaryColor: document.querySelector("#secondary-color"),
  opponent: document.querySelector("#opponent"),
  gameDate: document.querySelector("#game-date"),
  gameTime: document.querySelector("#game-time"),
  innings: document.querySelector("#innings"),
  inningsPlayed: document.querySelector("#innings-played"),
  generate: document.querySelector("#generate"),
  saveRoster: document.querySelector("#save-roster"),
  exportData: document.querySelector("#export-data"),
  importData: document.querySelector("#import-data"),
  importFile: document.querySelector("#import-file"),
  saveGameRecord: document.querySelector("#save-game-record"),
  saveGame: document.querySelector("#save-game"),
  undoSave: document.querySelector("#undo-save"),
  resetSeason: document.querySelector("#reset-season"),
  fillSample: document.querySelector("#fill-sample"),
  printPacket: document.querySelector("#print-packet"),
  lineupOutput: document.querySelector("#lineup-output"),
  seasonSummary: document.querySelector("#season-summary"),
  savedGames: document.querySelector("#saved-games"),
  status: document.querySelector("#status"),
  appVersion: document.querySelector("#app-version"),
  appChangelog: document.querySelector("#app-changelog"),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHexColor(value, fallback) {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex, "#000000").slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function mixHex(hex, targetHex, amount) {
  const source = hexToRgb(hex);
  const target = hexToRgb(targetHex);
  const mixAmount = clamp(amount, 0, 1);
  const mixed = {
    r: Math.round(source.r + (target.r - source.r) * mixAmount),
    g: Math.round(source.g + (target.g - source.g) * mixAmount),
    b: Math.round(source.b + (target.b - source.b) * mixAmount),
  };
  return `#${[mixed.r, mixed.g, mixed.b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function getBranding() {
  return {
    primaryColor: normalizeHexColor(elements.primaryColor.value, DEFAULT_BRANDING.primaryColor),
    secondaryColor: normalizeHexColor(elements.secondaryColor.value, DEFAULT_BRANDING.secondaryColor),
  };
}

function applyBranding(branding = DEFAULT_BRANDING) {
  const primaryColor = normalizeHexColor(branding.primaryColor, DEFAULT_BRANDING.primaryColor);
  const secondaryColor = normalizeHexColor(branding.secondaryColor, DEFAULT_BRANDING.secondaryColor);
  const root = document.documentElement;

  root.style.setProperty("--accent-dark", primaryColor);
  root.style.setProperty("--accent", secondaryColor);
  root.style.setProperty("--blue-outline", primaryColor);
  root.style.setProperty("--line", mixHex(primaryColor, "#ffffff", 0.82));
  root.style.setProperty("--shadow", `0 20px 45px ${mixHex(primaryColor, "#ffffff", 0.55)}40`);
  root.style.setProperty("--pink-glow", `${mixHex(secondaryColor, "#ffffff", 0.35)}33`);
  root.style.setProperty("--brand-primary-soft", mixHex(primaryColor, "#ffffff", 0.84));
  root.style.setProperty("--brand-primary-strong", mixHex(primaryColor, "#ffffff", 0.72));
  root.style.setProperty("--brand-secondary-soft", mixHex(secondaryColor, "#ffffff", 0.84));
  root.style.setProperty("--brand-secondary-strong", mixHex(secondaryColor, "#ffffff", 0.72));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", primaryColor);

  elements.primaryColor.value = primaryColor;
  elements.secondaryColor.value = secondaryColor;
}

function getEmptyStats() {
  return {
    games: 0,
    battingStarts: 0,
    battingSlots: Array(12).fill(0),
    infieldInnings: 0,
    outfieldInnings: 0,
    positionCounts: { P: 0, "1B": 0, "2B": 0, SS: 0, "3B": 0 },
    lastArea: null,
    lastPosition: null,
    consecutiveInfield: 0,
    consecutiveOutfield: 0,
  };
}

function normalizeStats(stats = {}) {
  return {
    ...getEmptyStats(),
    ...stats,
    battingSlots: Array.isArray(stats.battingSlots)
      ? [...stats.battingSlots, ...Array(Math.max(0, 12 - stats.battingSlots.length)).fill(0)].slice(0, 12)
      : Array(12).fill(0),
    positionCounts: {
      ...getEmptyStats().positionCounts,
      ...(stats.positionCounts || {}),
    },
  };
}

function readSeason() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return { players: {}, gamesSaved: 0, savedAt: null, undoStack: [], games: [] };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      players: Object.fromEntries(
        Object.entries(parsed.players || {}).map(([name, stats]) => [name, normalizeStats(stats)]),
      ),
      gamesSaved: parsed.gamesSaved || 0,
      savedAt: parsed.savedAt || null,
      undoStack: Array.isArray(parsed.undoStack) ? parsed.undoStack : [],
      games: Array.isArray(parsed.games) ? parsed.games : [],
    };
  } catch {
    return { players: {}, gamesSaved: 0, savedAt: null, undoStack: [], games: [] };
  }
}

function writeSeason(season) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(season));
}

function readSavedRoster() {
  const raw = localStorage.getItem(ROSTER_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      teamName: String(parsed.teamName || "").trim(),
      players: Array.isArray(parsed.players)
        ? parsed.players.map((name) => String(name || "").trim()).filter(Boolean)
        : [],
      attendanceByPlayer:
        parsed.attendanceByPlayer && typeof parsed.attendanceByPlayer === "object"
          ? Object.fromEntries(
              Object.entries(parsed.attendanceByPlayer).map(([name, isAttending]) => [
                String(name || "").trim(),
                Boolean(isAttending),
              ]),
            )
          : {},
      branding: {
        primaryColor: normalizeHexColor(parsed.branding?.primaryColor, DEFAULT_BRANDING.primaryColor),
        secondaryColor: normalizeHexColor(parsed.branding?.secondaryColor, DEFAULT_BRANDING.secondaryColor),
      },
    };
  } catch {
    return null;
  }
}

function renderAppVersion() {
  if (elements.appVersion) {
    const releaseDate = formatGameDate(CURRENT_RELEASE?.date);
    elements.appVersion.textContent = releaseDate
      ? `Version ${APP_VERSION} • ${releaseDate}`
      : "Version " + APP_VERSION;
  }
}

function renderChangelog() {
  if (!elements.appChangelog) {
    return;
  }

  if (!CURRENT_RELEASE) {
    elements.appChangelog.innerHTML = '<div class="empty-state">No release notes yet.</div>';
    return;
  }

  const changes = Array.isArray(CURRENT_RELEASE.changes) ? CURRENT_RELEASE.changes : [];
  const previousRelease = APP_RELEASES[1];

  elements.appChangelog.innerHTML = `
    <div class="changelog-current">
      <div class="changelog-version-row">
        <strong>${escapeHtml(APP_VERSION)}</strong>
        <span>${escapeHtml(formatGameDate(CURRENT_RELEASE.date) || "")}</span>
      </div>
      <div class="changelog-summary">${escapeHtml(CURRENT_RELEASE.summary || "Latest update")}</div>
      <ul class="changelog-list">
        ${changes.map((change) => `<li>${escapeHtml(change)}</li>`).join("")}
      </ul>
      ${
        previousRelease
          ? `<div class="changelog-previous">Previous release: ${escapeHtml(
              previousRelease.version || `v1.${Math.max(APP_RELEASES.length - 1, 0)}.0`,
            )}${previousRelease.summary ? ` • ${escapeHtml(previousRelease.summary)}` : ""}</div>`
          : ""
      }
    </div>
  `;
}

function writeSavedRoster(
  teamName,
  roster,
  branding = getBranding(),
  attendanceByPlayer = state.attendanceByPlayer,
) {
  const normalizedPlayers = normalizeRoster((roster || []).join("\n"));

  localStorage.setItem(
    ROSTER_STORAGE_KEY,
    JSON.stringify({
      teamName: String(teamName || "").trim(),
      players: normalizedPlayers,
      attendanceByPlayer: Object.fromEntries(
        normalizedPlayers.map((player) => [player, attendanceByPlayer[player] !== false]),
      ),
      branding: {
        primaryColor: normalizeHexColor(branding.primaryColor, DEFAULT_BRANDING.primaryColor),
        secondaryColor: normalizeHexColor(branding.secondaryColor, DEFAULT_BRANDING.secondaryColor),
      },
      savedAt: new Date().toISOString(),
    }),
  );
}

function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getMasterRoster() {
  return normalizeRoster(elements.rosterInput.value);
}

function syncAttendanceState(roster, defaultChecked = true) {
  const nextAttendance = {};

  roster.forEach((player) => {
    if (Object.prototype.hasOwnProperty.call(state.attendanceByPlayer, player)) {
      nextAttendance[player] = state.attendanceByPlayer[player];
    } else {
      nextAttendance[player] = defaultChecked;
    }
  });

  state.attendanceByPlayer = nextAttendance;
}

function renderAttendanceList() {
  const roster = getMasterRoster();
  syncAttendanceState(roster);

  if (!roster.length) {
    elements.attendanceList.innerHTML =
      '<div class="empty-state">Add player names above to choose who is attending.</div>';
    return;
  }

  elements.attendanceList.innerHTML = roster
    .map(
      (player, index) => `
        <label class="attendance-row">
          <input
            type="checkbox"
            class="attendance-checkbox"
            data-player="${escapeHtml(player)}"
            ${state.attendanceByPlayer[player] ? "checked" : ""}
          />
          <span class="attendance-dot">${index + 1}</span>
          <span class="attendance-name">${escapeHtml(player)}</span>
        </label>
      `,
    )
    .join("");

  elements.attendanceList.querySelectorAll(".attendance-checkbox").forEach((input) => {
    input.addEventListener("change", (event) => {
      const player = event.currentTarget.dataset.player;
      state.attendanceByPlayer[player] = event.currentTarget.checked;
    });
  });
}

function getSelectedRoster() {
  const roster = getMasterRoster();
  syncAttendanceState(roster);
  return roster.filter((player) => state.attendanceByPlayer[player]);
}

function buildUndoSnapshot(season) {
  return {
    players: cloneSeason(season.players || {}),
    gamesSaved: season.gamesSaved || 0,
    savedAt: season.savedAt || null,
    games: cloneSeason(season.games || []),
  };
}


function createGameId() {
  return `game-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function upsertGameRecord(season, gameRecord) {
  const games = Array.isArray(season.games) ? season.games : [];
  const existingIndex = games.findIndex((game) => game.id === gameRecord.id);

  if (existingIndex >= 0) {
    games[existingIndex] = gameRecord;
  } else {
    games.unshift(gameRecord);
  }

  season.games = games;
}

function isGameFinalized(game) {
  return Boolean(game?.appliedToSeason || game?.status === "finalized");
}

function getGameStatusLabel(game) {
  return isGameFinalized(game) ? "Finalized" : "Needs innings played";
}

function formatGameCardTitle(game) {
  const dateText = formatGameDate(game.config?.gameDate);
  const opponentText = game.config?.opponent ? `vs ${game.config.opponent}` : "Opponent TBD";
  return [dateText, opponentText].filter(Boolean).join(" • ") || "Saved game";
}

function buildCurrentGameRecord(statusOverride) {
  if (!state.latestGame) {
    return null;
  }

  const status = statusOverride || state.latestGame.status || "draft";
  const appliedToSeason = Boolean(state.latestGame.appliedToSeason && status === "finalized");

  return {
    id: state.latestGame.id || createGameId(),
    teamName: elements.teamName.value.trim() || "Koalas",
    roster: cloneSeason(state.latestGame.roster),
    attendanceByPlayer: cloneSeason(state.attendanceByPlayer),
    branding: getBranding(),
    config: cloneSeason(state.latestGame.config),
    battingOrder: cloneSeason(state.latestGame.battingOrder),
    innings: cloneSeason(state.latestGame.innings),
    inningsPlayed: Number(elements.inningsPlayed.value) || state.latestGame.config.innings,
    status,
    createdAt: state.latestGame.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    needsFollowUp: !appliedToSeason,
    appliedToSeason,
  };
}

function renderSavedGames() {
  const season = readSeason();
  const games = Array.isArray(season.games)
    ? [...season.games].sort((left, right) => {
        const leftPending = isGameFinalized(left) ? 1 : 0;
        const rightPending = isGameFinalized(right) ? 1 : 0;

        if (leftPending !== rightPending) {
          return leftPending - rightPending;
        }

        return String(right.updatedAt || right.createdAt || "").localeCompare(
          String(left.updatedAt || left.createdAt || ""),
        );
      })
    : [];

  if (!games.length) {
    elements.savedGames.innerHTML =
      '<div class="empty-state">No saved games yet. Generate a packet and it will auto-save here until you finalize it.</div>';
    return;
  }

  const pendingGames = games.filter((game) => !isGameFinalized(game));
  const summaryText = pendingGames.length
    ? `${pendingGames.length} game${pendingGames.length === 1 ? "" : "s"} still need innings played.`
    : "All saved games have been finalized into season stats.";

  elements.savedGames.innerHTML = `
    <div class="saved-games-summary">${escapeHtml(summaryText)}</div>
    <div class="saved-games-list">
      ${games
        .map(
          (game) => `
            <div class="saved-game-row">
              <div>
                <div class="saved-game-title">
                  ${escapeHtml(formatGameCardTitle(game))}
                  <span class="saved-game-badge ${isGameFinalized(game) ? "saved-game-badge-finalized" : "saved-game-badge-pending"}">
                    ${escapeHtml(getGameStatusLabel(game))}
                  </span>
                </div>
                <div class="saved-game-meta">
                  ${escapeHtml(game.teamName || "Team")} • Planned ${game.config?.innings || 0} inning(s) •
                  Recorded ${game.inningsPlayed || game.config?.innings || 0} inning(s) •
                  Updated ${escapeHtml(
                    new Date(game.updatedAt || game.createdAt || Date.now()).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    }),
                  )}
                </div>
              </div>
              <div class="saved-game-actions">
                <button class="secondary-button load-game-button" type="button" data-game-id="${escapeHtml(game.id)}">
                  ${isGameFinalized(game) ? "Load" : "Open & finalize"}
                </button>
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;

  elements.savedGames.querySelectorAll(".load-game-button").forEach((button) => {
    button.addEventListener("click", () => loadSavedGame(button.dataset.gameId));
  });
}

function loadSavedGame(gameId) {
  const season = readSeason();
  const game = (season.games || []).find((entry) => entry.id === gameId);

  if (!game) {
    setStatus("That saved game could not be found.");
    return;
  }

  elements.teamName.value = game.teamName || "Koalas";
  elements.rosterInput.value = (game.roster || []).join("\n");
  applyBranding(game.branding || DEFAULT_BRANDING);
  elements.opponent.value = game.config?.opponent || "";
  elements.gameDate.value = game.config?.gameDate || "";
  elements.gameTime.value = game.config?.gameTime || "";
  elements.innings.value = String(game.config?.innings || 4);
  elements.inningsPlayed.value = String(game.inningsPlayed || game.config?.innings || 4);
  elements.inningsPlayed.max = String(game.config?.innings || 4);
  state.attendanceByPlayer = game.attendanceByPlayer || {};
  syncAttendanceState(game.roster || []);
  renderAttendanceList();

  state.latestGame = {
    id: game.id,
    createdAt: game.createdAt,
    appliedToSeason: game.appliedToSeason,
    status: game.status,
    roster: cloneSeason(game.roster || []),
    config: cloneSeason(game.config || {}),
    battingOrder: cloneSeason(game.battingOrder || []),
    innings: cloneSeason(game.innings || []),
  };

  renderLineups(
    {
      config: cloneSeason(game.config || {}),
      battingOrder: cloneSeason(game.battingOrder || []),
      innings: cloneSeason(game.innings || []),
    },
    elements.teamName.value.trim(),
  );
  renderSeasonSummary(getMasterRoster());
  syncDocumentTitle(getConfig());
  setStatus(`Loaded saved game: ${formatGameCardTitle(game)}.`);
}

function normalizeRoster(text) {
  return text
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name, index, array) => array.indexOf(name) === index);
}

function getPlayerStats(name, season) {
  return normalizeStats(season.players[name]);
}

function getConfig() {
  return {
    opponent: elements.opponent.value.trim(),
    gameDate: elements.gameDate.value,
    gameTime: elements.gameTime.value,
    innings: Number(elements.innings.value),
    inningsPlayed: Number(elements.inningsPlayed.value),
  };
}

function validateInput(roster, config) {
  if (roster.length < 5) {
    return "Add at least 5 players before generating positions.";
  }

  if (config.innings < 1) {
    return "Choose at least 1 inning.";
  }

  if (config.inningsPlayed < 1) {
    return "Choose at least 1 inning actually played.";
  }

  if (config.inningsPlayed > config.innings) {
    return "Innings actually played cannot be more than the innings you generated.";
  }

  return "";
}

function cloneSeason(season) {
  return JSON.parse(JSON.stringify(season));
}

function ensurePlayersExist(season, roster) {
  roster.forEach((player) => {
    season.players[player] = normalizeStats(season.players[player]);
  });
}

function buildBattingOrder(roster, season) {
  const startOffset = season.gamesSaved % roster.length;
  return roster.map((_, index) => roster[(index + startOffset) % roster.length]);
}

function getMaxAllowedOutfieldStreak(rosterSize) {
  if (rosterSize <= INFIELD_POSITIONS.length) {
    return 0;
  }

  return Math.max(1, Math.ceil(rosterSize / INFIELD_POSITIONS.length) - 1);
}

function pickInfielders(roster, season, inningIndex) {
  const maxAllowedOutfieldStreak = getMaxAllowedOutfieldStreak(roster.length);

  return [...roster]
    .sort((left, right) => {
      const leftStats = getPlayerStats(left, season);
      const rightStats = getPlayerStats(right, season);

      const leftInfieldPenalty = leftStats.lastArea === "IF" ? leftStats.consecutiveInfield * 130 : 0;
      const rightInfieldPenalty = rightStats.lastArea === "IF" ? rightStats.consecutiveInfield * 130 : 0;
      const leftOutfieldPriority =
        leftStats.lastArea === "OF"
          ? leftStats.consecutiveOutfield >= maxAllowedOutfieldStreak
            ? 900 + leftStats.consecutiveOutfield * 180
            : leftStats.consecutiveOutfield * 150
          : 0;
      const rightOutfieldPriority =
        rightStats.lastArea === "OF"
          ? rightStats.consecutiveOutfield >= maxAllowedOutfieldStreak
            ? 900 + rightStats.consecutiveOutfield * 180
            : rightStats.consecutiveOutfield * 150
          : 0;

      const leftScore =
        leftStats.infieldInnings * 12 +
        KEY_POSITIONS.reduce((sum, position) => sum + leftStats.positionCounts[position], 0) * 3 +
        leftInfieldPenalty -
        leftOutfieldPriority;
      const rightScore =
        rightStats.infieldInnings * 12 +
        KEY_POSITIONS.reduce((sum, position) => sum + rightStats.positionCounts[position], 0) * 3 +
        rightInfieldPenalty -
        rightOutfieldPriority;

      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }

      const leftIndex = (roster.indexOf(left) - inningIndex + roster.length) % roster.length;
      const rightIndex = (roster.indexOf(right) - inningIndex + roster.length) % roster.length;

      return leftIndex - rightIndex;
    })
    .slice(0, Math.min(INFIELD_POSITIONS.length, roster.length));
}

function pickPlayerForPosition(position, availablePlayers, season, inningIndex, roster) {
  return [...availablePlayers].sort((left, right) => {
    const leftStats = getPlayerStats(left, season);
    const rightStats = getPlayerStats(right, season);

    const leftWasSamePosition = leftStats.lastPosition === position ? 20 : 0;
    const rightWasSamePosition = rightStats.lastPosition === position ? 20 : 0;

    const leftKeyLoad = KEY_POSITIONS.reduce(
      (sum, keyPosition) => sum + leftStats.positionCounts[keyPosition],
      0,
    );
    const rightKeyLoad = KEY_POSITIONS.reduce(
      (sum, keyPosition) => sum + rightStats.positionCounts[keyPosition],
      0,
    );

    const leftScore =
      leftStats.positionCounts[position] * 10 +
      (KEY_POSITIONS.includes(position) ? leftKeyLoad * 2 : 0) +
      leftWasSamePosition;
    const rightScore =
      rightStats.positionCounts[position] * 10 +
      (KEY_POSITIONS.includes(position) ? rightKeyLoad * 2 : 0) +
      rightWasSamePosition;

    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    const leftIndex = (roster.indexOf(left) - inningIndex + roster.length) % roster.length;
    const rightIndex = (roster.indexOf(right) - inningIndex + roster.length) % roster.length;

    return leftIndex - rightIndex;
  })[0];
}

function getOutfieldSlots(count) {
  const slotsByCount = {
    1: [{ x: 50, y: 40, label: "Outfield" }],
    2: [
      { x: 40, y: 44, label: "Left Outfield" },
      { x: 60, y: 44, label: "Right Outfield" },
    ],
    3: [
      { x: 38, y: 46, label: "Left Field" },
      { x: 50, y: 35, label: "Center Field" },
      { x: 62, y: 46, label: "Right Field" },
    ],
    4: [
      { x: 33, y: 51, label: "Left Field" },
      { x: 44, y: 39, label: "Left Center" },
      { x: 56, y: 39, label: "Right Center" },
      { x: 67, y: 51, label: "Right Field" },
    ],
    5: [
      { x: 28, y: 54, label: "Left Field" },
      { x: 40, y: 42, label: "Left Center" },
      { x: 50, y: 33, label: "Center Field" },
      { x: 60, y: 42, label: "Right Center" },
      { x: 72, y: 54, label: "Right Field" },
    ],
    6: [
      { x: 26, y: 55, label: "Left Field" },
      { x: 36, y: 47, label: "Left Deep" },
      { x: 44, y: 39, label: "Left Center" },
      { x: 50, y: 31, label: "Center Field" },
      { x: 60, y: 39, label: "Right Center" },
      { x: 74, y: 55, label: "Right Field" },
    ],
    7: [
      { x: 24, y: 54, label: "Far Left" },
      { x: 34, y: 47, label: "Left Deep" },
      { x: 42, y: 39, label: "Left Center" },
      { x: 50, y: 31, label: "Center Field" },
      { x: 58, y: 39, label: "Right Center" },
      { x: 66, y: 47, label: "Right Deep" },
      { x: 76, y: 54, label: "Far Right" },
    ],
    8: [
      { x: 24, y: 55, label: "Far Left" },
      { x: 32, y: 48, label: "Left Deep" },
      { x: 39, y: 41, label: "Left Field" },
      { x: 45, y: 35, label: "Left Center" },
      { x: 55, y: 35, label: "Right Center" },
      { x: 61, y: 41, label: "Right Field" },
      { x: 68, y: 48, label: "Right Deep" },
      { x: 76, y: 55, label: "Far Right" },
    ],
  };

  return slotsByCount[count] || slotsByCount[8];
}

function renderSvgPlayerLabel(player, label, x, y, tone = "outfield") {
  const boxWidth = 132;
  const boxHeight = 64;
  const left = x - boxWidth / 2;
  const top = y - boxHeight / 2;
  const fill = "#ffffff";
  const stroke = "#d7e5ff";

  return `
    <g class="svg-player ${tone}">
      <rect x="${left}" y="${top}" width="${boxWidth}" height="${boxHeight}" rx="16" fill="${fill}" stroke="${stroke}" stroke-width="2"></rect>
      <text x="${x}" y="${y - 4}" text-anchor="middle" class="svg-player-name">${escapeHtml(player)}</text>
      <text x="${x}" y="${y + 17}" text-anchor="middle" class="svg-player-role">${escapeHtml(label)}</text>
    </g>
  `;
}

function renderFieldSvg(inning) {
  const infieldLabels = [
    renderSvgPlayerLabel(inning.assignments.P, "Pitcher", 500, 720, "infield"),
    renderSvgPlayerLabel(inning.assignments["1B"], "1st Base", 635, 680, "infield"),
    renderSvgPlayerLabel(inning.assignments["2B"], "2nd Base", 590, 560, "infield"),
    renderSvgPlayerLabel(inning.assignments.SS, "Shortstop", 410, 560, "infield"),
    renderSvgPlayerLabel(inning.assignments["3B"], "3rd Base", 365, 680, "infield"),
  ].join("");

  const outfieldLabels = inning.outfieldAssignments
    .map((assignment) =>
      renderSvgPlayerLabel(
        assignment.player,
        assignment.spot.label,
        assignment.spot.x * 10,
        assignment.spot.y * 10,
        "outfield",
      ),
    )
    .join("");

  return `
    <svg class="field-svg" viewBox="0 0 1000 1000" role="img" aria-label="Softball field positions for inning ${inning.inning}">
      <rect x="0" y="0" width="1000" height="1000" rx="28" fill="#4d9d53"></rect>
      <line x1="500" y1="862" x2="132" y2="494" stroke="#ffffff" stroke-width="7" stroke-linecap="round"></line>
      <line x1="500" y1="862" x2="868" y2="494" stroke="#ffffff" stroke-width="7" stroke-linecap="round"></line>
      <path d="M 292 654 L 500 446 L 708 654 L 500 862 Z" fill="#c88d52" stroke="#dfa46b" stroke-width="12" stroke-linejoin="round"></path>
      <circle cx="500" cy="700" r="60" fill="none" stroke="#ffffff" stroke-width="7"></circle>
      <rect x="486" y="848" width="28" height="28" fill="#ffffff" stroke="#8e775f" stroke-width="3" transform="rotate(45 500 862)"></rect>
      <rect x="678" y="640" width="24" height="24" fill="#ffffff" stroke="#8e775f" stroke-width="3" transform="rotate(45 690 652)"></rect>
      <rect x="488" y="432" width="24" height="24" fill="#ffffff" stroke="#8e775f" stroke-width="3" transform="rotate(45 500 444)"></rect>
      <rect x="298" y="640" width="24" height="24" fill="#ffffff" stroke="#8e775f" stroke-width="3" transform="rotate(45 310 652)"></rect>
      ${outfieldLabels}
      ${infieldLabels}
    </svg>
  `;
}

function assignInning(roster, workingSeason, inningIndex) {
  ensurePlayersExist(workingSeason, roster);

  const infielders = pickInfielders(roster, workingSeason, inningIndex);
  const outfielders = roster.filter((player) => !infielders.includes(player));
  const available = [...infielders];
  const assignments = {};

  ["P", "SS", "3B", "1B", "2B"].forEach((position) => {
    const selected = pickPlayerForPosition(position, available, workingSeason, inningIndex, roster);
    assignments[position] = selected;
    available.splice(available.indexOf(selected), 1);
  });

  const outfieldSpots = getOutfieldSlots(outfielders.length);
  const outfieldAssignments = outfielders.map((player, index) => ({
    player,
    spot: outfieldSpots[index] || outfieldSpots[outfieldSpots.length - 1],
  }));

  roster.forEach((player) => {
    const stats = workingSeason.players[player];
    const position = Object.keys(assignments).find((key) => assignments[key] === player);

    if (position) {
      stats.infieldInnings += 1;
      stats.positionCounts[position] += 1;
      stats.consecutiveInfield = stats.lastArea === "IF" ? stats.consecutiveInfield + 1 : 1;
      stats.consecutiveOutfield = 0;
      stats.lastArea = "IF";
      stats.lastPosition = position;
    } else {
      stats.outfieldInnings += 1;
      stats.consecutiveOutfield = stats.lastArea === "OF" ? stats.consecutiveOutfield + 1 : 1;
      stats.consecutiveInfield = 0;
      stats.lastArea = "OF";
      stats.lastPosition = "OF";
    }
  });

  return {
    inning: inningIndex + 1,
    assignments,
    outfieldAssignments,
  };
}

function generateGame(roster, config, season) {
  const workingSeason = cloneSeason(season);
  ensurePlayersExist(workingSeason, roster);

  const battingOrder = buildBattingOrder(roster, workingSeason);
  const innings = [];

  for (let inningIndex = 0; inningIndex < config.innings; inningIndex += 1) {
    innings.push(assignInning(roster, workingSeason, inningIndex));
  }

  return { battingOrder, innings };
}

function getPlayerPositionForInning(player, inning) {
  if (!player) {
    return "";
  }

  const foundPosition = Object.entries(inning.assignments).find(([, name]) => name === player);

  if (foundPosition) {
    return foundPosition[0];
  }

  const outfieldSpot = inning.outfieldAssignments.find((assignment) => assignment.player === player);
  return outfieldSpot ? `OF` : "";
}

function padToTwelve(players) {
  return Array.from({ length: 12 }, (_, index) => players[index] || "");
}

function getFirstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

function renderCoachTable(players, innings, options = {}) {
  const headingColumns = innings
    .map((inning) => `<th>Inning ${inning.inning}</th>`)
    .join("");

  const visibleOrder = padToTwelve(players);
  const tableClass = options.compact ? "coach-table compact-coach-table" : "coach-table";

  const rows = visibleOrder
    .map(
      (player, index) => `
        <tr class="${index % 2 === 0 ? "batting-row-blue" : "batting-row-pink"}">
          <td class="batting-slot">${options.slotLabels?.[index] || index + 1}</td>
          <td class="batting-player">${player || "&nbsp;"}</td>
          ${innings
            .map((inning) => `<td>${getPlayerPositionForInning(player, inning)}</td>`)
            .join("")}
        </tr>
      `,
    )
    .join("");

  return `
    <table class="${tableClass}">
      <thead>
        <tr>
          <th class="batting-head-slot">Bat</th>
          <th class="batting-head-player">Player</th>
          ${headingColumns}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderFieldPage(teamName, inning) {
  const gameMeta = renderGameMeta(state.latestGame?.config);

  return `
    <section class="print-page field-page">
      <header class="print-header">
        <div>
          <p class="print-kicker">${teamName || "Team Lineup"}</p>
          <h3>Inning ${inning.inning} Field Card</h3>
        </div>
        ${gameMeta}
      </header>
      <div class="softball-field full-page-field">
        ${renderFieldSvg(inning)}
      </div>
    </section>
  `;
}

function formatGameDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  const [year, month, day] = dateValue.split("-").map(Number);

  if (!year || !month || !day) {
    return dateValue;
  }

  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatGameTime(timeValue) {
  if (!timeValue) {
    return "";
  }

  const [hours, minutes] = timeValue.split(":").map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return timeValue;
  }

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderGameMeta(config = {}) {
  const parts = [
    config.opponent ? `vs ${escapeHtml(config.opponent)}` : "",
    formatGameDate(config.gameDate),
    formatGameTime(config.gameTime),
    "Version " + APP_VERSION,
  ].filter(Boolean);

  return `<div class="print-meta">${parts.join(" • ")}</div>`;
}

function buildPrintTitle(config = {}) {
  const teamName = (elements.teamName.value || "Koalas").trim() || "Koalas";
  const opponent = (config.opponent || elements.opponent.value || "Opponent").trim() || "Opponent";
  const dateValue = config.gameDate || elements.gameDate.value;

  let compactDate = "000000";

  if (dateValue) {
    const [year, month, day] = dateValue.split("-");

    if (year && month && day) {
      compactDate = `${year.slice(-2)}${month}${day}`;
    }
  }

  return `${compactDate} ${teamName} v ${opponent}`;
}

function syncDocumentTitle(config = {}) {
  document.title = buildPrintTitle(config);
}

function renderLineups(gamePlan, teamName) {
  if (!gamePlan || !gamePlan.innings.length) {
    elements.lineupOutput.innerHTML = `<div class="empty-state">Generate a lineup packet to see the printable sheets.</div>`;
    return;
  }

  const gameMeta = renderGameMeta(gamePlan.config);
  const alphabeticalOrder = [...gamePlan.battingOrder].sort((left, right) =>
    getFirstName(left).localeCompare(getFirstName(right)),
  );
  const alphabeticalSlotLabels = padToTwelve(alphabeticalOrder).map((player) => {
    if (!player) {
      return "&nbsp;";
    }

    const battingIndex = gamePlan.battingOrder.indexOf(player);
    return battingIndex >= 0 ? battingIndex + 1 : "&nbsp;";
  });

  const coachReferencePage = `
    <section class="print-page coach-reference-page">
      <header class="print-header">
        <div>
          <p class="print-kicker">${teamName || "Team Lineup"}</p>
          <h3>Coach Reference</h3>
        </div>
        ${gameMeta}
      </header>
      <section class="coach-reference-block">
        <h4>Batting Order</h4>
        ${renderCoachTable(gamePlan.battingOrder, gamePlan.innings, { compact: true })}
      </section>
      <section class="coach-reference-block">
        <h4>Alphabetical</h4>
        ${renderCoachTable(alphabeticalOrder, gamePlan.innings, {
          compact: true,
          slotLabels: alphabeticalSlotLabels,
        })}
      </section>
    </section>
  `;

  const coachSheet = `
    <section class="print-page coach-sheet">
      <header class="print-header">
        <div>
          <p class="print-kicker">${teamName || "Team Lineup"}</p>
          <h3>Batting Order</h3>
        </div>
        ${gameMeta}
      </header>
      ${renderCoachTable(gamePlan.battingOrder, [])}
    </section>
  `;

  const fieldPages = gamePlan.innings
    .map((inning) => renderFieldPage(teamName, inning))
    .join("");

  elements.lineupOutput.innerHTML = `
    <div class="print-toolbar">
      <p class="table-note">Printable packet includes one coach sheet plus one full-page field card for each inning.</p>
      <button class="primary-button" type="button" id="print-inline">Print packet</button>
    </div>
    <div class="packet">${coachReferencePage}${coachSheet}${fieldPages}</div>
  `;

  document.querySelector("#print-inline").addEventListener("click", () => {
    if (state.latestGame) {
      saveGameRecord({ silent: true });
    }
    window.print();
  });
}

function renderSeasonSummary(roster) {
  const season = readSeason();

  if (!roster.length || !roster.some((player) => season.players[player])) {
    elements.seasonSummary.innerHTML =
      '<div class="empty-state">No season data yet. Save a generated game to start tracking position fairness.</div>';
    return;
  }

  const rows = roster
    .map((player) => ({ player, stats: getPlayerStats(player, season) }))
    .sort((left, right) => left.player.localeCompare(right.player))
    .map(
      ({ player, stats }) => `
        <tr>
          <td>${player}</td>
          <td>${stats.games}</td>
          <td>${stats.infieldInnings}</td>
          <td>${stats.outfieldInnings}</td>
          <td>${stats.positionCounts.P}</td>
          <td>${stats.positionCounts["1B"]}</td>
          <td>${stats.positionCounts.SS}</td>
          <td>${stats.positionCounts["3B"]}</td>
        </tr>
      `,
    )
    .join("");

  elements.seasonSummary.innerHTML = `
    <div class="table-note">Saved games: ${season.gamesSaved}</div>
    <table>
      <thead>
        <tr>
          <th>Player</th>
          <th>Games</th>
          <th>IF</th>
          <th>OF</th>
          <th>P</th>
          <th>1B</th>
          <th>SS</th>
          <th>3B</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}


function saveGameRecord(options = {}) {
  if (!state.latestGame) {
    setStatus("Generate a lineup packet before saving a game record.");
    return null;
  }

  const season = readSeason();
  const record = buildCurrentGameRecord(state.latestGame.status || "draft");
  record.needsFollowUp = !isGameFinalized(record);
  upsertGameRecord(season, record);
  writeSeason(season);

  state.latestGame.id = record.id;
  state.latestGame.createdAt = record.createdAt;
  state.latestGame.status = record.status;
  renderSavedGames();

  if (!options.silent) {
    setStatus(`Saved game record: ${formatGameCardTitle(record)}. You can come back later to enter innings played.`);
  }

  return record;
}

function saveLatestGame() {
  if (!state.latestGame) {
    setStatus("Generate a lineup packet before saving the game.");
    return;
  }

  const season = readSeason();
  const { roster, battingOrder, innings } = state.latestGame;
  const inningsPlayed = Number(elements.inningsPlayed.value);
  const previousSeasonSnapshot = buildUndoSnapshot(season);

  if (!Number.isFinite(inningsPlayed) || inningsPlayed < 1) {
    setStatus("Enter how many innings were actually played before saving.");
    return;
  }

  if (inningsPlayed > innings.length) {
    setStatus("Innings actually played cannot be more than the generated innings.");
    return;
  }

const inningsToSave = innings.slice(0, inningsPlayed);
const existingGame =
  state.latestGame.id && Array.isArray(season.games)
    ? season.games.find((game) => game.id === state.latestGame.id)
    : null;

if (existingGame?.appliedToSeason) {
  setStatus("That game is already finalized in season stats.");
  return;
}

  ensurePlayersExist(season, roster);

  roster.forEach((player) => {
    season.players[player].games += 1;
  });

  battingOrder.forEach((player, index) => {
    season.players[player].battingSlots[index] += 1;
    if (index === 0) {
      season.players[player].battingStarts += 1;
    }
  });

  inningsToSave.forEach((inning) => {
    roster.forEach((player) => {
      const assignedPosition = Object.entries(inning.assignments).find(([, name]) => name === player);

      if (assignedPosition) {
        const positionCode = assignedPosition[0];
        season.players[player].infieldInnings += 1;
        season.players[player].positionCounts[positionCode] += 1;
        season.players[player].consecutiveInfield =
          season.players[player].lastArea === "IF" ? season.players[player].consecutiveInfield + 1 : 1;
        season.players[player].consecutiveOutfield = 0;
        season.players[player].lastArea = "IF";
        season.players[player].lastPosition = positionCode;
      } else {
        season.players[player].outfieldInnings += 1;
        season.players[player].consecutiveOutfield =
          season.players[player].lastArea === "OF" ? season.players[player].consecutiveOutfield + 1 : 1;
        season.players[player].consecutiveInfield = 0;
        season.players[player].lastArea = "OF";
        season.players[player].lastPosition = "OF";
      }
    });
  });

season.gamesSaved += 1;
season.savedAt = new Date().toISOString();
season.undoStack = [...(season.undoStack || []), previousSeasonSnapshot].slice(-MAX_UNDO_HISTORY);
const finalizedRecord = buildCurrentGameRecord("finalized");
finalizedRecord.inningsPlayed = inningsPlayed;
finalizedRecord.appliedToSeason = true;
finalizedRecord.needsFollowUp = false;
upsertGameRecord(season, finalizedRecord);
writeSeason(season);
state.latestGame.id = finalizedRecord.id;
state.latestGame.createdAt = finalizedRecord.createdAt;
state.latestGame.status = "finalized";
state.latestGame.appliedToSeason = true;
renderSeasonSummary(roster);
renderSavedGames();
setStatus(`Saved ${inningsPlayed} played inning${inningsPlayed === 1 ? "" : "s"} to season stats.`);
}

function saveRoster() {
  const roster = getMasterRoster();
  const teamName = elements.teamName.value.trim();
  const branding = getBranding();

  if (!roster.length) {
    setStatus("Add player names before saving the roster.");
    return;
  }

  writeSavedRoster(teamName, roster, branding, state.attendanceByPlayer);
  renderAttendanceList();
  setStatus(`Saved ${roster.length} player names${teamName ? ` for ${teamName}` : ""}.`);
}

function exportData() {
  const exportBundle = {
    version: 1,
    appVersion: APP_VERSION,
    releaseDate: CURRENT_RELEASE?.date || null,
    releaseSummary: CURRENT_RELEASE?.summary || "",
    exportedAt: new Date().toISOString(),
    roster: {
      teamName: elements.teamName.value.trim(),
      players: getMasterRoster(),
      attendanceByPlayer: state.attendanceByPlayer,
      branding: getBranding(),
    },
    season: readSeason(),
  };

  const title = buildPrintTitle({
    opponent: elements.opponent.value.trim() || "data",
    gameDate: elements.gameDate.value,
  }).replace(/[\\/:*?"<>|]/g, "-");

  downloadTextFile(`${title} roster-season-export.json`, JSON.stringify(exportBundle, null, 2), "application/json");
  setStatus("Exported roster and season data.");
}

function importDataFile(file) {
  const reader = new FileReader();

  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      const importedRoster = {
        teamName: String(parsed.roster?.teamName || "").trim(),
        players: Array.isArray(parsed.roster?.players)
          ? parsed.roster.players.map((name) => String(name || "").trim()).filter(Boolean)
          : [],
        attendanceByPlayer:
          parsed.roster?.attendanceByPlayer && typeof parsed.roster.attendanceByPlayer === "object"
            ? Object.fromEntries(
                Object.entries(parsed.roster.attendanceByPlayer).map(([name, isAttending]) => [
                  String(name || "").trim(),
                  Boolean(isAttending),
                ]),
              )
            : {},
        branding: {
          primaryColor: normalizeHexColor(
            parsed.roster?.branding?.primaryColor,
            DEFAULT_BRANDING.primaryColor,
          ),
          secondaryColor: normalizeHexColor(
            parsed.roster?.branding?.secondaryColor,
            DEFAULT_BRANDING.secondaryColor,
          ),
        },
      };

      if (parsed.season) {
        const normalizedSeason = {
          players: Object.fromEntries(
            Object.entries(parsed.season.players || {}).map(([name, stats]) => [name, normalizeStats(stats)]),
          ),
          gamesSaved: parsed.season.gamesSaved || 0,
          savedAt: parsed.season.savedAt || null,
          undoStack: Array.isArray(parsed.season.undoStack) ? parsed.season.undoStack : [],
          games: Array.isArray(parsed.season.games) ? parsed.season.games : [],
        };
        writeSeason(normalizedSeason);
      }

      if (importedRoster.players.length) {
        elements.teamName.value = importedRoster.teamName || "Koalas";
        elements.rosterInput.value = importedRoster.players.join("\n");
        applyBranding(importedRoster.branding);
        state.attendanceByPlayer = importedRoster.attendanceByPlayer;
        writeSavedRoster(
          elements.teamName.value.trim(),
          importedRoster.players,
          importedRoster.branding,
          importedRoster.attendanceByPlayer,
        );
        syncAttendanceState(importedRoster.players);
        renderAttendanceList();
        renderSeasonSummary(importedRoster.players);
        renderSavedGames();
      }

      syncDocumentTitle(getConfig());
      setStatus("Imported roster and season data.");
    } catch {
      setStatus("That file could not be imported.");
    } finally {
      elements.importFile.value = "";
    }
  });

  reader.readAsText(file);
}

function undoLastSave() {
  const season = readSeason();
  const undoStack = Array.isArray(season.undoStack) ? season.undoStack : [];

  if (!undoStack.length) {
    setStatus("There is no saved game to undo.");
    return;
  }

  const previousSeason = undoStack[undoStack.length - 1];
  const restoredSeason = {
    players: Object.fromEntries(
      Object.entries(previousSeason.players || {}).map(([name, stats]) => [name, normalizeStats(stats)]),
    ),
    gamesSaved: previousSeason.gamesSaved || 0,
    savedAt: previousSeason.savedAt || null,
    undoStack: undoStack.slice(0, -1),
    games: cloneSeason(previousSeason.games || []),
  };

  writeSeason(restoredSeason);
  const roster = normalizeRoster(elements.rosterInput.value);
  renderSeasonSummary(roster);
  renderSavedGames();
  setStatus("Undid the last saved game.");
}

function setStatus(message) {
  elements.status.textContent = message;
}

function onGenerate() {
  const roster = getSelectedRoster();
  const config = getConfig();
  const error = validateInput(roster, config);

  if (error) {
    setStatus(error);
    return;
  }

  const season = readSeason();
  const gamePlan = generateGame(roster, config, season);
  gamePlan.config = config;
  syncDocumentTitle(config);

  state.latestGame = {
    roster,
    config,
    battingOrder: gamePlan.battingOrder,
    innings: gamePlan.innings,
    status: "draft",
    appliedToSeason: false,
  };

  elements.inningsPlayed.value = String(config.innings);
  elements.inningsPlayed.max = String(config.innings);
  saveGameRecord({ silent: true });

  renderLineups(gamePlan, elements.teamName.value.trim());
  renderSeasonSummary(roster);
  renderSavedGames();
  setStatus(`Generated and auto-saved a printable ${config.innings}-inning packet for ${roster.length} players.`);
}

function onResetSeason() {
  localStorage.removeItem(STORAGE_KEY);
  const roster = getMasterRoster();
  renderSeasonSummary(roster);
  renderSavedGames();
  setStatus("Season stats reset.");
}

function hydrateDefaults() {
  const savedRoster = readSavedRoster();
  renderAppVersion();
  renderChangelog();
  elements.innings.value = "4";
  elements.inningsPlayed.value = "4";
  elements.inningsPlayed.max = "4";
  syncDocumentTitle();

  if (savedRoster?.players?.length) {
    elements.teamName.value = savedRoster.teamName || "Koalas";
    elements.rosterInput.value = savedRoster.players.join("\n");
    applyBranding(savedRoster.branding || DEFAULT_BRANDING);
    state.attendanceByPlayer = savedRoster.attendanceByPlayer || {};
    syncAttendanceState(savedRoster.players);
    renderAttendanceList();
    renderSeasonSummary(savedRoster.players);
    renderSavedGames();
    syncDocumentTitle(getConfig());
    return;
  }

  elements.teamName.value = "Koalas";
  elements.rosterInput.value = sampleRoster.join("\n");
  applyBranding(DEFAULT_BRANDING);
  syncAttendanceState(sampleRoster);
  renderAttendanceList();
  renderSeasonSummary(sampleRoster);
  renderSavedGames();
  syncDocumentTitle(getConfig());
}

elements.innings.addEventListener("input", () => {
  const innings = Math.max(1, Number(elements.innings.value) || 1);
  elements.inningsPlayed.max = String(innings);

  if (Number(elements.inningsPlayed.value) > innings) {
    elements.inningsPlayed.value = String(innings);
  }

  if (state.latestGame && !state.latestGame.appliedToSeason) {
    state.latestGame.config.innings = innings;
    saveGameRecord({ silent: true });
    renderSavedGames();
  }
});

elements.inningsPlayed.addEventListener("input", () => {
  if (state.latestGame && !state.latestGame.appliedToSeason) {
    saveGameRecord({ silent: true });
    renderSavedGames();
  }
});
elements.rosterInput.addEventListener("input", () => {
  renderAttendanceList();
});
elements.generate.addEventListener("click", onGenerate);
elements.saveRoster.addEventListener("click", saveRoster);
elements.exportData.addEventListener("click", exportData);
elements.importData.addEventListener("click", () => elements.importFile.click());
elements.importFile.addEventListener("change", (event) => {
  const [file] = event.currentTarget.files || [];

  if (file) {
    importDataFile(file);
  }
});
elements.saveGameRecord.addEventListener("click", saveGameRecord);
elements.saveGame.addEventListener("click", saveLatestGame);
elements.undoSave.addEventListener("click", undoLastSave);
elements.resetSeason.addEventListener("click", onResetSeason);
elements.fillSample.addEventListener("click", () => {
  elements.teamName.value = "Koalas";
  elements.rosterInput.value = sampleRoster.join("\n");
  applyBranding(DEFAULT_BRANDING);
  syncAttendanceState(sampleRoster);
  renderAttendanceList();
  renderSeasonSummary(sampleRoster);
  setStatus("Sample 12-player roster loaded.");
});
elements.printPacket.addEventListener("click", () => {
  if (state.latestGame) {
    saveGameRecord({ silent: true });
  }
  window.print();
});
elements.teamName.addEventListener("input", () => syncDocumentTitle(getConfig()));
elements.opponent.addEventListener("input", () => syncDocumentTitle(getConfig()));
elements.gameDate.addEventListener("input", () => syncDocumentTitle(getConfig()));
elements.primaryColor.addEventListener("input", () => applyBranding(getBranding()));
elements.secondaryColor.addEventListener("input", () => applyBranding(getBranding()));

hydrateDefaults();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js");
  });
}
