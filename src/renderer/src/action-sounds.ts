import {
  ACTION_SOUND_KINDS,
  type ActionSoundKind,
  SOUND_THEMES,
  type SoundChoice,
  type SoundTheme,
} from "@openbot/ui/features/settings/app-settings";
import { bind, type PlayOptions, play, type SoundName, setEnabled, setMuted, setTheme } from "cuelume";

const ACTION_SOUNDS_STORAGE_KEY = "openbot:action-sounds-enabled";
const ACTION_SOUNDS_THEME_STORAGE_KEY = "openbot:action-sounds-theme";
const ACTION_SOUNDS_KIND_STORAGE_KEY = {
  clicks: "openbot:action-sounds-clicks",
  typing: "openbot:action-sounds-typing",
} as const satisfies Record<ActionSoundKind, string>;
/** The cues of each kind. The other cues, such as `success` and `error`, follow only the sound menu. */
const ACTION_SOUNDS_OF_KIND = {
  clicks: ["tap", "select", "toggle", "open", "close", "navigate"],
  typing: ["type"],
} as const satisfies Record<ActionSoundKind, readonly SoundName[]>;

type PreferenceStorage = Pick<Storage, "getItem">;

/** The choices for this page after the browser did not save them. They win over older saved values. */
let unsavedPreference: boolean | undefined;
let unsavedTheme: SoundTheme | undefined;
const unsavedKinds: Partial<Record<ActionSoundKind, boolean>> = {};
let started = false;

/**
 * The sounds are off until the user turns them on: an update must not start new sounds. Reading
 * `window.localStorage` throws when the browser blocks storage, so it is read inside the guard.
 */
export function isActionSoundEnabled(storage?: PreferenceStorage): boolean {
  if (unsavedPreference !== undefined) return unsavedPreference;
  try {
    return (storage ?? window.localStorage).getItem(ACTION_SOUNDS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function readActionSoundTheme(storage?: PreferenceStorage): SoundTheme {
  if (unsavedTheme !== undefined) return unsavedTheme;
  try {
    const saved = (storage ?? window.localStorage).getItem(ACTION_SOUNDS_THEME_STORAGE_KEY);
    return SOUND_THEMES.find((theme) => theme === saved) ?? "default";
  } catch {
    return "default";
  }
}

/**
 * A kind is on until the user turns it off: an update must not stop the sounds of a user who has
 * the action sounds on. The kind plays only while the action sounds are on.
 */
export function isActionSoundKindEnabled(kind: ActionSoundKind, storage?: PreferenceStorage): boolean {
  const unsaved = unsavedKinds[kind];
  if (unsaved !== undefined) return unsaved;
  try {
    return (storage ?? window.localStorage).getItem(ACTION_SOUNDS_KIND_STORAGE_KEY[kind]) !== "false";
  } catch {
    return true;
  }
}

/** The sound menu value: "off", or the saved theme. */
export function readActionSoundChoice(): SoundChoice {
  return isActionSoundEnabled() ? readActionSoundTheme() : "off";
}

/** Returns false when blocked or full storage keeps the choice for this page only. */
function savePreference(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Saves a sound menu choice and plays it. "off" keeps the theme, so the next time the user turns
 * the sounds on, the menu shows the theme from before.
 */
export function setActionSoundChoice(choice: SoundChoice): void {
  const enabled = choice !== "off";
  unsavedPreference = savePreference(ACTION_SOUNDS_STORAGE_KEY, String(enabled)) ? undefined : enabled;
  if (!enabled) {
    play("close");
    setEnabled(false);
    return;
  }
  unsavedTheme = savePreference(ACTION_SOUNDS_THEME_STORAGE_KEY, choice) ? undefined : choice;
  setEnabled(true);
  setTheme(choice);
  // The menu's own click is skipped while the sounds are off, and it does not name a theme, so the
  // preview plays here.
  play("success", { theme: choice });
}

function applySavedKinds(): void {
  setMuted(ACTION_SOUND_KINDS.flatMap((kind) => (isActionSoundKindEnabled(kind) ? [] : ACTION_SOUNDS_OF_KIND[kind])));
}

/** Saves the switch of one kind of action sound. The other kinds and the sound menu do not change. */
export function setActionSoundKindEnabled(kind: ActionSoundKind, enabled: boolean): void {
  if (savePreference(ACTION_SOUNDS_KIND_STORAGE_KEY[kind], String(enabled))) delete unsavedKinds[kind];
  else unsavedKinds[kind] = enabled;
  applySavedKinds();
  // The click that turns the click sounds on is skipped, because they were off, so its cue plays here.
  if (kind === "clicks" && enabled && isActionSoundEnabled()) play("toggle");
}

function applySavedChoice(): void {
  setTheme(readActionSoundTheme());
  setEnabled(isActionSoundEnabled());
  applySavedKinds();
}

/**
 * Plays the cues that shared controls name in their `data-cuelume-*` attributes, and follows a change
 * that another tab saves. Later calls do nothing.
 */
export function startActionSounds(): void {
  if (started) return;
  started = true;
  applySavedChoice();
  const savedKeys: readonly string[] = [
    ACTION_SOUNDS_STORAGE_KEY,
    ACTION_SOUNDS_THEME_STORAGE_KEY,
    ...Object.values(ACTION_SOUNDS_KIND_STORAGE_KEY),
  ];
  window.addEventListener("storage", (event) => {
    if (event.key !== null && savedKeys.includes(event.key)) applySavedChoice();
  });
  bind();
}

/**
 * Plays a cue for an action that no control click reports, such as a reply that failed. It reads the
 * saved choice, so a page that did not call `startActionSounds`, such as a story, stays silent.
 */
export function playActionSound(sound: SoundName, options?: PlayOptions): void {
  if (isActionSoundEnabled()) play(sound, options);
}
