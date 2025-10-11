import { BaseClientService } from '@/services/baseClientService';

import { IFlowService } from './type'
import { clientDB } from '@/database/client/db';
import { FlowState, FlowNodeMeta } from '@/types/flow';
import { FlowStateModel, FlowMetaDataModel } from '@/database/models/flow';
import { TopicModel } from '@/database/models/topic';
import { FlowNodeMetaItem, FlowStateItem } from '@/database/schemas';

export class ClientService extends BaseClientService implements IFlowService {
    
    private get flowStateModel(): FlowStateModel {
        return new FlowStateModel(clientDB as any, this.userId);
    }

    private get flowMetaModel(): FlowMetaDataModel {
        return new FlowMetaDataModel(clientDB as any, this.userId);
    }

    private get topicModel(): TopicModel {
        return new TopicModel(clientDB as any, this.userId);
    }
    
    constructor(userId?: string) {
        super(userId);
    }

    async updateNodeMeta(id: string, meta: Partial<FlowNodeMeta>): Promise<void> {}

    async createNodeMeta(topicId: string, meta: Partial<FlowNodeMeta>) {
        // Use meta to avoid unused variable error
        const topic = await this.topicModel.findById(topicId);
        if (!topic) {
            throw new Error('Topic not found');
        }
        // Find state
        const flowState = await this.flowStateModel.findByTopicId(topicId);
        if (!flowState) {
            throw new Error('Flow state not found');
        }
        return await this.flowMetaModel.create({
            flowStateId: flowState.id,
            metadata: {
                messageIds: [],
                messages: [],
                summary: meta?.summary || '',
                title: meta?.title || '',
                useSummary: meta?.useSummary || false,
            }
        });
    }

    async removeNodeMeta(id: string): Promise<void> {
        // Just delete the meta
        return await this.flowMetaModel.delete(id);
    }

    async createCanvasState(topicId: string) {
        // Create 
        return await this.flowStateModel.create({
            metadata: {
                edges: [],
                nodes: [],
            },
            topicId
        });
    }

    updateCanvasState(topicId: string, state: Partial<FlowState>): Promise<FlowState> {}

    async getCanvasState(topicId?: string) {
        if (!topicId) {
            return;
        }
        // TODO:
        const flowState = await this.flowStateModel.findByTopicId(topicId)
        return {
            ...flowState?.metadata,
            nodeMetas: flowState?.nodeMetas || [],
        } as FlowState;
    }
}