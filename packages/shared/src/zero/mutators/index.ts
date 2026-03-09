import { defineMutators } from "@rocicorp/zero";
import { sessionMutators } from "./sessions";
import { imposterMutators } from "./imposter";
import { passwordMutators } from "./password";
import { chatMutators } from "./chat";
import { chainReactionMutators } from "./chain-reaction";
import { shadeSignalMutators } from "./shade-signal";
import { demoMutators } from "./demo";

export { imposterCategories, imposterCategoryLabels, chainCategories, chainCategoryLabels, passwordCategories, passwordCategoryLabels, gameCategories, gameCategoryLabels } from "./word-banks";

export const mutators = defineMutators({
  sessions: sessionMutators,
  imposter: imposterMutators,
  password: passwordMutators,
  chat: chatMutators,
  chainReaction: chainReactionMutators,
  shadeSignal: shadeSignalMutators,
  demo: demoMutators
});
