import { Flexbox } from 'react-layout-kit';

import ChatInput from './ChatInput';
import ChatList from './ChatList';
import Header from './Header';
import Summary from './Summary';
import { useGraphStore } from '@/store/graph';

export default function DetailBox() {
  const activedNodeId = useGraphStore(s => s.activeNodeId);
  return (
    <Flexbox height={'100%'}>
      <Header title="title" />
      <Flexbox height={'100%'}>
        <Summary id={activedNodeId} />
        <ChatList />
      </Flexbox>
      <ChatInput />
    </Flexbox>
  );
}
