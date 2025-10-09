import { Flexbox } from 'react-layout-kit';

import ChatInput from './ChatInput';
import ChatList from './ChatList';
import Header from './Header';
import Summary from './Summary';

export default function DetailBox() {
  return (
    <Flexbox height={'100%'}>
      <Header title="title" />
      <Flexbox height={'100%'}>
        <Summary />
        <ChatList />
      </Flexbox>
      <ChatInput />
    </Flexbox>
  );
}
