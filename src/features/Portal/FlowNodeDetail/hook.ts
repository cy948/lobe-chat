import { useFlowStore } from '@/store/flow';

export const useEnable = () => useFlowStore(s => s.detailBoxVisible);

export const onClose = () => {
  useFlowStore.setState({ detailBoxVisible: false });
};
