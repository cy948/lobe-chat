import { ChatMessage } from '@lobechat/types';
import { useResponsive } from 'antd-style';
import { memo } from 'react';
import { Flexbox } from 'react-layout-kit';

import Avatar from '@/features/ChatItem/components/Avatar';
import BorderSpacing from '@/features/ChatItem/components/BorderSpacing';
import MessageContent from '@/features/ChatItem/components/MessageContent';
import Title from '@/features/ChatItem/components/Title';
import { useStyles } from '@/features/ChatItem/style';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { useAgentStore } from '@/store/agent';
import { agentChatConfigSelectors } from '@/store/agent/selectors';
import { messageSelectors, useGraphStore } from '@/store/graph';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import UserActionsBar from '../ActionsBar';

interface UserMessageProps extends ChatMessage {
  disableEditing?: boolean;
  index: number;
}

const UserMessage = memo<UserMessageProps>((props) => {
  const { id, content, createdAt, index, disableEditing } = props;

  const { mobile } = useResponsive();
  const avatar = useUserAvatar();
  const title = useUserStore(userProfileSelectors.displayUserName);

  const displayMode = useAgentStore(agentChatConfigSelectors.displayMode);

  const [editing, generating] = useGraphStore((s) => [
    messageSelectors.isMessageEditing(s)(id),
    messageSelectors.isMessageLoading(s)(id),
  ]);

  const loading = generating;

  const placement = displayMode === 'chat' ? 'right' : 'left';
  const variant = displayMode === 'chat' ? 'bubble' : 'docs';

  const { styles } = useStyles({
    editing,
    placement,
    primary: true,
    showTitle: false,
    time: createdAt,
    title,
    variant,
  });

  return (
    <Flexbox
      className={styles.container}
      direction={placement === 'left' ? 'horizontal' : 'horizontal-reverse'}
      gap={mobile ? 6 : 12}
    >
      <Avatar
        alt={title}
        avatar={{ avatar, title }}
        loading={loading}
        placement={placement}
        size={mobile ? 32 : undefined}
        style={{ marginTop: 6 }}
      />
      <Flexbox
        align={placement === 'left' ? 'flex-start' : 'flex-end'}
        className={styles.messageContainer}
      >
        <Title
          avatar={{ avatar, title }}
          placement={placement}
          showTitle={false}
          time={createdAt}
        />
        <Flexbox
          align={placement === 'left' ? 'flex-start' : 'flex-end'}
          className={styles.messageContent}
          direction={placement === 'left' ? 'horizontal' : 'horizontal-reverse'}
          gap={8}
        >
          <Flexbox width={'100%'}>
            <MessageContent
              editing={editing}
              id={id}
              message={content}
              placement={placement}
              primary
              variant={variant}
            />
          </Flexbox>

          {!disableEditing && (
            <Flexbox align={'flex-start'} className={styles.actions} role="menubar">
              <UserActionsBar data={props} id={id} index={index} />
            </Flexbox>
          )}
        </Flexbox>
      </Flexbox>
      {mobile && variant === 'bubble' && <BorderSpacing borderSpacing={32} />}
    </Flexbox>
  );
});

export default UserMessage;
