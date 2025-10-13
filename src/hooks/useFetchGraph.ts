import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useGraphStore } from '@/store/graph';

export const useFetchGraphState = () => {
    const isDBInited = useGlobalStore(systemStatusSelectors.isDBInited);
    const [activeStateId, useFetchCanvasState] = useGraphStore((s) => [
        s.activeStateId,
        s.useFetchCanvasState,
    ])

    useFetchCanvasState(isDBInited, activeStateId);
};
