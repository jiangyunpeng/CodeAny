export type ExploreDecisionInput = {
  userInput: string;
  initialSearchResultCount?: number;
  repoFileCount?: number;
};

export function shouldUseExplore(input: ExploreDecisionInput): boolean {
  const broadIntent = /深入|全面|梳理|研究|调用链|前后端|trace|explore|thoroughly/.test(input.userInput);
  const tooManyInitialResults = (input.initialSearchResultCount ?? 0) > 50;
  const repoFeelsLarge = (input.repoFileCount ?? 0) > 200;

  return broadIntent || tooManyInitialResults || repoFeelsLarge;
}
