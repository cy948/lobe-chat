
export interface FlowAIChatState {
    /**
     * @title 正在加载的聊天ID列表
     */
    chatLoadingIds: string[];
    chatLoadingIdsAbortController?: AbortController;
    isCreateingMessage: boolean;

    messageLoadingIds: string[]; 
    reasoningLoadingIds: string[];
}

export const initialAiChatState: FlowAIChatState = {
    chatLoadingIds: [],
    messageLoadingIds: [],
    reasoningLoadingIds: [],
    isCreateingMessage: false,
};