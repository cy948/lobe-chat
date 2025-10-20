import { DynamicLayoutProps } from '@/types/next';
import { RouteVariants } from '@/utils/server/routeVariants';

import ChatHydration from './features/ChatHydration';
import ChatInput from './features/ChatInput';
import ChatMinimap from './features/ChatMinimap';
import ThreadHydration from './features/ThreadHydration';
import ZenModeToast from './features/ZenModeToast';
import Content from './Content'

const ChatConversation = async (props: DynamicLayoutProps) => {
  const isMobile = await RouteVariants.getIsMobile(props);

  return (
    <>
      <ZenModeToast />
      <Content />
      <ChatInput mobile={isMobile} />
      <ChatHydration />
      <ThreadHydration />
      {!isMobile && <ChatMinimap />}
    </>
  );
};

ChatConversation.displayName = 'ChatConversation';

export default ChatConversation;
