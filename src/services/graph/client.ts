import { clientDB } from '@/database/client/db';
import { GraphNodeModel, GraphStateModel } from '@/database/models/graph';
import { BaseClientService } from '@/services/baseClientService';
import { CanvasState, GraphNode, GraphNodeMeta, GraphState, GraphTopic } from '@/types/graph';

import { IGraphService } from './type';

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

      if (stateId) {
        const state = await this.graphStateModel.findById(stateId);
        if (state) {
          retState = {
            id: state.id,
            nodes: state.nodes.map(
              (node) =>
                ({
                  id: node.id,
                  messages: node.messages || undefined,
                  meta: node.meta,
                }) as GraphNode,
            ),
            state: state.state,
          };
        }
      }

      if (!retState) {
        // Try fetch the latest state
        // TODO: should use a TopicList rather than create a new state every time
        const latest = await this.graphStateModel.findLatest();
        // console.log('Found latest state', latest);
        if (!latest) {
          // No state found, try create one
          const newState = await this.graphStateModel.create({
            edges: [],
            nodes: [],
          });
          retState = {
            id: newState.id,
            nodes: [],
            state: newState.state,
          };
        } else {
          retState = {
            id: latest.id,
            nodes: latest.nodes.map(
              (node) =>
                ({
                  id: node.id,
                  messages: node.messages || undefined,
                  meta: node.meta,
                }) as GraphNode,
            ),
            state: latest.state,
          };
        }
      }

      return retState;
    } catch (e) {
      console.log(e);
    }
  };

  fetchTopics = async () => {
    const topics = await this.graphStateModel.findAll();
    return topics.map(
      (topic) =>
        ({
          id: topic.id,
          title: topic.title,
        }) as GraphTopic,
    );
  };

  createState = async () => {
    return await this.graphStateModel.create({
      edges: [],
      nodes: [],
    });
  };

  updateCanvasState = async (stateId: string, state: Partial<CanvasState>) => {
    return await this.graphStateModel.updateState(stateId, state);
  };

  updateState = async (stateId: string, data: Partial<GraphTopic>) => {
    return await this.graphStateModel.update(stateId, data);
  };

  removeState = async (stateId: string) => {
    return await this.graphStateModel.delete(stateId);
  };

  fetchNodes = async (stateId: string) => {
    const results = await this.graphNodeModel.findByStateId(stateId);
    return results.map(
      (node) =>
        ({
          id: node.id,
          messages: node.messages || undefined,
          meta: node.meta,
        }) as GraphNode,
    );
  };

  createNode = async (stateId: string, meta: Partial<GraphNodeMeta>) => {
    return await this.graphNodeModel.create(stateId, meta);
  };

  updateNode = async (nodeId: string, meta: Partial<GraphNodeMeta>) => {
    return await this.graphNodeModel.update(nodeId, meta);
  };
}
