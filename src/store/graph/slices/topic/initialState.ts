import { GraphTopic } from '@/types/graph';

export interface GraphTopicState {
  stateTopicList: GraphTopic[];
}

export const initialGraphTopicState: GraphTopicState = {
  stateTopicList: [],
};
