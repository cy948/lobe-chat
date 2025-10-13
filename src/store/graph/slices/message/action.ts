import { StateCreator } from 'zustand/vanilla';
import { GraphStore } from '@/store/graph';


export interface GraphMessageAction {

}

export const graphMessage: StateCreator<
  GraphStore,
  [['zustand/devtools', never]],
  [],
  GraphMessageAction
> = (set, get) => ({

});

