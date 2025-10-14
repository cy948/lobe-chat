import { ChatMessage } from '@/types/message';

export interface GraphMessageState {
  /**
   * is the message is editing
   */
  messageEditingIds: string[];
  messageInit: boolean;
  messageLoadingIds: string[];
  messagesMap: Record<string, ChatMessage[]>;
}

export const initialGraphMessageState: GraphMessageState = {
  messageEditingIds: [],
  messageInit: false,
  messageLoadingIds: [],
  messagesMap: {},
};
