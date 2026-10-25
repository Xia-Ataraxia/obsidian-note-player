import { swingMs } from './turntable';

export const LID_OPEN_MS = 650;
export const REDUCED_LID_MS = 200;
/** Beat between the arm reaching its rest and the lid starting to close. */
export const LID_CLOSE_HOLD_MS = 350;

export interface DeckPose {
  open: boolean;
  armed: boolean;
}

export interface DeckStep {
  atMs: number;
  pose: Partial<DeckPose>;
  /** The needle touches down at this step. */
  land?: true;
}

/**
 * One timeline driven by play state, planned from the pose the deck is in right now so an
 * interruption reverses from where it is. Play: lid, arm, needle. Stop: arm, then lid.
 */
export function deckSteps(playing: boolean, from: DeckPose, hasLid: boolean, reduced: boolean): DeckStep[] {
  const swing = swingMs(reduced);
  if (playing) {
    const wait = hasLid && !from.open ? (reduced ? REDUCED_LID_MS : LID_OPEN_MS) : 0;
    const steps: DeckStep[] = [{ atMs: 0, pose: { open: hasLid } }, { atMs: wait, pose: { armed: true } }];
    steps.push({ atMs: wait + (from.armed ? 0 : swing), pose: {}, land: true });
    return steps;
  }
  const steps: DeckStep[] = [{ atMs: 0, pose: { armed: false } }];
  if (hasLid) steps.push({ atMs: from.armed ? swing + LID_CLOSE_HOLD_MS : 0, pose: { open: false } });
  return steps;
}
