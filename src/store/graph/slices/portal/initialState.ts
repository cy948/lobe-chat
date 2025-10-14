import { ChatMessage } from '@/types/message';

export interface GraphPortalState {
    showPortal: boolean;
    activeNodeId?: string;
    inputSummary: string;
    inputMessage: string;
}

export const initialGraphPortalState: GraphPortalState = {
    showPortal: false,
    inputSummary: '',
    inputMessage: '',
};
