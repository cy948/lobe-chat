import { StateCreator } from 'zustand/vanilla';
import { FlowStore } from '@/store/flow/store';

export interface FlowDetailBoxAction {
    setDetailBoxVisible: (visible: boolean) => void;
    openInDetailBox: (nodeId: string) => void;
}

export const flowDetailBox: StateCreator<
    FlowStore,
    [['zustand/devtools', never]],
    [],
    FlowDetailBoxAction
> = (set, get) => ({
    setDetailBoxVisible(visible) {
        set({ ...get(), detailBoxVisible: visible });
    },
    openInDetailBox(nodeId) {
        // Open the detail box for the specified node
        console.log('Opening detail box for node:', nodeId);
        set({ ...get(), activeNodeId: nodeId, detailBoxVisible: true });
    }
})