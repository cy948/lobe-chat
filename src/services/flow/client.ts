import { clientDB } from '@/database/client/db';
import { FlowMetaDataModel, FlowStateModel } from '@/database/models/flow';
import { MessageModel } from '@/database/models/message';
import { TopicModel } from '@/database/models/topic';
import { BaseClientService } from '@/services/baseClientService';
import { FlowNodeMeta, FlowState } from '@/types/flow';

import { IFlowService } from './type';

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

  private get messageModel(): MessageModel {
    return new MessageModel(clientDB as any, this.userId);
  }

  constructor(userId?: string) {
    super(userId);
  }

  async updateNodeMeta(id: string, meta: Partial<FlowNodeMeta>): Promise<void> {
    await this.flowMetaModel.update(id, meta);
  }

  async createNodeMeta(stateId: string, meta: Partial<FlowNodeMeta>) {
    // Use meta to avoid unused variable error
    return await this.flowMetaModel.create({
      flowStateId: stateId,
      metadata: {
        messageIds: [],
        messages: [],
        summary: meta?.summary || '',
        title: meta?.title || '',
        useSummary: meta?.useSummary || false,
      },
    });
  }

  async removeNodeMeta(id: string): Promise<void> {
    // Just delete the meta
    return await this.flowMetaModel.delete(id);
  }

  async createCanvasState(topicId: string) {
    // Create
    const state = await this.flowStateModel.create({
      metadata: {
        edges: [],
        nodes: [],
      },
      topicId,
    });
    return state.id;
  }

  async updateCanvasState(id: string, state: Partial<FlowState>): Promise<string> {
    // await this.flowStateModel
    await this.flowStateModel.update(id, state);
    return id;
  }

  async getCanvasState(stateId?: string) {
    if (!stateId) return;
    // TODO:
    const flowState = await this.flowStateModel.findById(stateId);
    return flowState
      ? ({
          edges: flowState?.metadata?.edges || [],
          nodeMetas: flowState?.nodeMeta || undefined,
          nodes: flowState?.metadata?.nodes || [],
        } as FlowState)
      : undefined;
  }

  async getFlowState(stateId?: string) {
    if (!stateId) return;

    const flowState = await this.flowStateModel.findById(stateId);
    if (!flowState) return;
    await this.messageModel.query({
      topicId: flowState.topicId,
    });
  }
}
