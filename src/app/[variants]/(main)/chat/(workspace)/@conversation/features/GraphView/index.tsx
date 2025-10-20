'use client';

import { ReactFlow } from '@xyflow/react'

import WideScreenContainer from '@/features/Conversation/components/WideScreenContainer';
import { useFetchMessages } from '@/hooks/useFetchMessages';
import { useChatStore } from '@/store/chat';
import { chatSelectors } from '@/store/chat/selectors';

export default function GraphView() {

    const [isCurrentChatLoaded] = useChatStore((s) => [chatSelectors.isCurrentChatLoaded(s)]);

    useFetchMessages();
    const data = useChatStore(chatSelectors.mainDisplayChatIDs);


    return (
        <WideScreenContainer flex={1} height={'100%'}>
            <ReactFlow
                nodes={[]}
                edges={[]}
            >
            </ReactFlow>
        </WideScreenContainer >
    )
}