// import { useChatStore } from '@/store/chat';
import { useFlowStore } from '@/store/flow';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
// import { useSessionStore } from '@/store/session';

export const useFetchFlowState = () => {
    const isDBInited = useGlobalStore(systemStatusSelectors.isDBInited);
    // const [sessionId] = useSessionStore((s) => [s.activeId]);
    //   const [activeTopicId, useFetchMessages] = useChatStore((s) => [
    //     s.activeTopicId,
    //     s.useFetchMessages,
    //   ]);

    const [activeStateId, useFetchCanvasState] = useFlowStore((s) => [
        s.activeStateId,
        s.useFetchCanvasState,
    ])

    //   useFetchMessages(isDBInited, sessionId, activeTopicId);
    useFetchCanvasState(isDBInited, activeStateId);
};
