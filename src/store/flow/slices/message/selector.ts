import type { FlowStore } from '@/store/flow';

const isMessageLoading = (id: string) => (s: FlowStore) => s.messageLoadingIds.includes(id);

const isMessageEditing = (id: string) => (s: FlowStore) => s.messageEditingIds.includes(id);

export const flowMessageSelectors = {
  isMessageEditing,
  isMessageLoading,
};
