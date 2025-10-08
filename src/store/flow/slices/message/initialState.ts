import { ChatInputEditor } from "@/features/ChatInput";

export interface FlowMessageState {
  messagesInit: boolean;
  messageEditingIds: string[];
  messageInputEditor: ChatInputEditor | null;
  messageLoadingIds: string[];
}

export const initialFlowMessageState: FlowMessageState = {
  messageEditingIds: [],
  messageLoadingIds: [],
  messagesInit: false,
  messageInputEditor: null,
};
