export interface GraphChatState {
  /**
   * @title 正在加载的聊天ID列表
   */
  chatLoadingIds: string[];
  chatLoadingIdsAbortController?: AbortController;
  isCreatingMessage: boolean;
  isGeneratingSummary: boolean;
  reasoningLoadingIds: string[];
}

export const initialGraphChatState: GraphChatState = {
  chatLoadingIds: [],
  isCreatingMessage: false,
  isGeneratingSummary: false,
  reasoningLoadingIds: [],
};
