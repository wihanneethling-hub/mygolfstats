export const STORAGE_KEY = 'golf-pwa-starter-v1';
const DEMO_ROUND_SIGNATURES = new Set([
  '1|2026-04-10|Joel|Rondebosch|Yellow',
  '2|2026-04-03|Joel|Rondebosch|Yellow',
  '3|2026-03-29|Zach|Westlake|White'
]);

function getRoundSignature(round) {
  return [
    round?.id,
    round?.date,
    round?.player,
    round?.course,
    round?.tees
  ].join('|');
}

function stripSeededDemoRounds(state) {
  if (!state || !Array.isArray(state.savedRounds)) return state;

  return {
    ...state,
    savedRounds: state.savedRounds.filter((round) => !DEMO_ROUND_SIGNATURES.has(getRoundSignature(round))),
    demoRoundsRemovedAt: state.demoRoundsRemovedAt || new Date().toISOString()
  };
}

function stripLegacyActiveDraft(state) {
  if (!state || typeof state !== 'object') return state;

  const {
    course,
    tees,
    draftCourse,
    draftTees,
    transcript,
    voiceRecap,
    holes,
    clarifications,
    hasParsed,
    ...rest
  } = state;

  return rest;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const withoutDraft = stripLegacyActiveDraft(parsed);
    const migrated = stripSeededDemoRounds(withoutDraft);
    if (
      migrated !== parsed ||
      withoutDraft !== parsed ||
      migrated.savedRounds?.length !== parsed.savedRounds?.length
    ) {
      saveState(migrated);
    }
    return migrated;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage write errors in MVP
  }
}

export function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage write errors in MVP
  }
}
