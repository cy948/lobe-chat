import { clientDB } from '@/database/client/db';
import { BaseClientService } from '@/services/baseClientService';

import { GraphNode, GraphState, CanvasState, GraphNodeMeta } from '@/types/graph';

import { IGraphService } from './type';
import { GraphStateModel, GraphNodeModel } from '@/database/models/graph';

export class ClientService extends BaseClientService implements IGraphService {

  private get graphStateModel(): GraphStateModel {
    return new GraphStateModel(clientDB as any, this.userId);
  }

  private get graphNodeModel(): GraphNodeModel {
    return new GraphNodeModel(clientDB as any, this.userId);
  }


  fetchState = async (stateId?: string): Promise<GraphState | undefined> => {
    try {
      let retState: GraphState | undefined = undefined;

      console.log('fetchState', { stateId });

      if (stateId) {
        const state = await this.graphStateModel.findById(stateId);
        if (state) {
          retState = {
            id: state.id,
            state: state.state,
            nodes: state.nodes.map((node) => ({
              id: node.id,
              meta: node.meta,
              messages: node.messages || undefined,
            } as GraphNode)),
          }
        }
      }

      if (!retState) {
        // Try fetch the latest state
        // TODO: should use a TopicList rather than create a new state every time
        const latest = await this.graphStateModel.findLatest();
        if (!latest) {
          // No state found, try create one
          const newState = await this.graphStateModel.create({
            nodes: [],
            edges: [],
          });
          retState = {
            id: newState.id,
            state: newState.state,
            nodes: []
          }
        }
      }

      console.log('fetchState result', { retState });

      return retState;
    } catch (e) {
      console.log(e)
    }
  }

  updateState = async (stateId: string, state: Partial<CanvasState>) => {
    return await this.graphStateModel.update(stateId, state);
  }

  createNode = async (stateId: string, meta: Partial<GraphNodeMeta>) => {
    return await this.graphNodeModel.create(stateId, meta);
  }

  updateNode = async (nodeId: string, meta: Partial<GraphNodeMeta>) => {
    return await this.graphNodeModel.update(nodeId, meta);
  }
}
