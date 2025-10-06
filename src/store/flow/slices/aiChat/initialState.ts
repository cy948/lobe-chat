
export interface FlowAIChatState {
    /**
     * @title 正在加载的聊天ID列表
     */
    chatLoadingIds: string[];
    chatLoadingIdsAbortController?: AbortController;
    inputMessage: string;
    inputLoading: boolean;

}

export const initialAiChatState: FlowAIChatState = {
    chatLoadingIds: [],
    inputMessage: '',
    inputLoading: false,
};