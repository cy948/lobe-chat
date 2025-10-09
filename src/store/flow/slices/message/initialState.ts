import { ChatInputEditor } from '@/features/ChatInput';

export interface FlowMessageState {
  messageEditingIds: string[];
  messageInputEditor: ChatInputEditor | null;
  messageLoadingIds: string[];
  messagesInit: boolean;
}

export const initialFlowMessageState: FlowMessageState = {
  messageEditingIds: [],
  messageInputEditor: null,
  messageLoadingIds: [],
  messagesInit: false,
};
