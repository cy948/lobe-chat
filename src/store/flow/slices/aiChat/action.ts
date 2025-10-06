import { StateCreator } from "zustand/vanilla";
import { FlowStore } from '@/store/flow/store';

export interface FlowAIChatAction {
  setInputMessage: (message: string) => void;
  fetchAIResponse: () => void;
}


export const flowAIChat: StateCreator<
  FlowStore,
  [['zustand/devtools', never]],
  [],
  FlowAIChatAction
> = (set, get) => ({
  setInputMessage: (message) => {
    set({
      ...get(),
      inputMessage: message,
    });
  },
  fetchAIResponse() {
    const message = get().inputMessage;
    get().setInputMessage('');
    set({ inputLoading: true });
  },
})