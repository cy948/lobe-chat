import { clientDB } from '@/database/client/db';
import { FlowMetaDataModel, FlowStateModel } from '@/database/models/flow';
import { MessageModel } from '@/database/models/message';
import { TopicModel } from '@/database/models/topic';
import { BaseClientService } from '@/services/baseClientService';
import { FlowNodeMeta, FlowState } from '@/types/flow';

import { GraphState } from '@/types/graph';

import { IGraphService } from './type';

export class ClientService extends BaseClientService implements IGraphService {
  fetchState = async (stateId?: string): Promise<GraphState | undefined> => {
    if (!stateId) return;

    // TODO: 
    return {} as any
  }

}
