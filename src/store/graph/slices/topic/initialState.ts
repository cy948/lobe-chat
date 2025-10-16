import { GraphTopic } from '@/types/graph';

export interface GraphTopicState {
  stateTopicList: GraphTopic[];
  topicRenamingId: string;
}

export const initialGraphTopicState: GraphTopicState = {
  stateTopicList: [],
  topicRenamingId: '',
};
