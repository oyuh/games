import { defineMutators } from "@rocicorp/zero";
import { sessionMutators } from "./sessions";
import { imposterMutators } from "./imposter";
import { passwordMutators } from "./password";
import { chatMutators } from "./chat";
import { chainReactionMutators } from "./chain-reaction";
import { shadeSignalMutators } from "./shade-signal";
import { locationSignalMutators } from "./location-signal";
import { demoMutators } from "./demo";
import { devMutators } from "./dev";

export { imposterCategories, imposterCategoryLabels, chainCategories, chainCategoryLabels, passwordCategories, passwordCategoryLabels, gameCategories, gameCategoryLabels } from "./word-banks";

/* The three rules Password's UI has to agree with the server about: what
   counts as one word, what is too close to the word, and what a word is
   worth. A second copy in the client is a second copy that drifts.

   scoreForLetters is Chain's version of the last one: what a word is still
   worth once you have burned letters off it. */
export { isOneWord, isClueTooSimilar, scorePasswordGuessCount, scoreForLetters } from "./helpers";

/* Shade's version of the same deal: what makes a clue legal, so the composer
   can say why the send button is off in the words the mutator would have
   thrown. */
export { shadeClueProblem, SHADE_COLOR_WORDS } from "./shade-signal";

export const mutators = defineMutators({
  sessions: sessionMutators,
  imposter: imposterMutators,
  password: passwordMutators,
  chat: chatMutators,
  chainReaction: chainReactionMutators,
  shadeSignal: shadeSignalMutators,
  locationSignal: locationSignalMutators,
  demo: demoMutators,
  dev: devMutators
});
