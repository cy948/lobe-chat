export interface FlowAIChatState {
    /**
     * @title 正在加载的聊天ID列表
     */
    chatLoadingIds: string[];
    chatLoadingIdsAbortController?: AbortController;
    isCreateingMessage: boolean;
    isGeneratingSummary: boolean;
    reasoningLoadingIds: string[];
}

export const initialAiChatState: FlowAIChatState = {
    chatLoadingIds: [],
    reasoningLoadingIds: [],
    isCreateingMessage: false,
    isGeneratingSummary: false,
};