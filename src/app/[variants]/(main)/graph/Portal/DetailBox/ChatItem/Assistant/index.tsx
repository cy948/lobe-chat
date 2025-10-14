'use client';

import { ChatMessage } from '@lobechat/types';
import { useResponsive } from 'antd-style';
import { ReactNode, memo, useCallback } from 'react';
import { Flexbox } from 'react-layout-kit';

import { LOADING_FLAT } from '@/const/message';
import Avatar from '@/features/ChatItem/components/Avatar';
import BorderSpacing from '@/features/ChatItem/components/BorderSpacing';
import ErrorContent from '@/features/ChatItem/components/ErrorContent';
import MessageContent from '@/features/ChatItem/components/MessageContent';
import Title from '@/features/ChatItem/components/Title';
import { useStyles } from '@/features/ChatItem/style';
import ErrorMessageExtra, { useErrorContent } from '@/features/Conversation/Error';
import { AssistantMessageExtra } from '@/features/Conversation/Messages/Assistant/Extra';
import { AssistantMessageContent } from '@/features/Conversation/Messages/Assistant/MessageContent';
import { useAgentStore } from '@/store/agent';
import { agentChatConfigSelectors } from '@/store/agent/slices/chat';

import AssistantActionsBar from '../ActionsBar';
import { chatSelectors, messageSelectors, useGraphStore } from '@/store/graph';

const MOBILE_AVATAR_SIZE = 32;

interface AssistantMessageProps extends ChatMessage {
  disableEditing?: boolean;
  index: number;
  showTitle?: boolean;
}
const AssistantMessage = memo<AssistantMessageProps>((props) => {
  const {
    error,
    showTitle,
    id,
    disableEditing,
    index,
    content,
    createdAt,
    tools,
    extra,
    metadata,
    meta,
  } = props;
  const avatar = meta;
  const { mobile } = useResponsive();
  const placement = 'left';
  const type = useAgentStore(agentChatConfigSelectors.displayMode);
  const variant = type === 'chat' ? 'bubble' : 'docs';

  const [editing, generating] = useGraphStore((s) => [
    messageSelectors.isMessageEditing(s)(id),
    chatSelectors.isMessageGenerating(s)(id),
  ]);

  const { styles } = useStyles({
    editing,
    placement,
    primary: false,
    showTitle,
    time: createdAt,
    title: avatar.title,
    variant,
  });
  const errorContent = useErrorContent(error);

  // remove line breaks in artifact tag to make the ast transform easier
  const message = content;

  // when the message is in RAG flow or the AI generating, it should be in loading state
  const loading = generating;

  // ======================= Performance Optimization ======================= //
  // these useMemo/useCallback are all for the performance optimization
  // maybe we can remove it in React 19
  // ======================================================================== //

  const renderMessage = useCallback(
    (editableContent: ReactNode) => (
      <AssistantMessageContent {...props} editableContent={editableContent} />
    ),
    [props],
  );
  const errorMessage = <ErrorMessageExtra data={props} />;
  return (
    <Flexbox
      className={styles.container}
      direction={placement === 'left' ? 'horizontal' : 'horizontal-reverse'}
      gap={mobile ? 6 : 12}
    >
      <Avatar
        alt={avatar.title || 'avatar'}
        avatar={avatar}
        loading={loading}
        placement={placement}
        size={mobile ? MOBILE_AVATAR_SIZE : undefined}
        style={{ marginTop: 6 }}
      />
      <Flexbox align={'flex-start'} className={styles.messageContainer}>
        <Title avatar={avatar} placement={placement} showTitle={showTitle} time={createdAt} />
        <Flexbox
          align={'flex-start'}
          className={styles.messageContent}
          data-layout={'vertical'} // 添加数据属性以方便样式选择
          direction={'vertical'}
          gap={8}
        >
          <Flexbox width={'100%'}>
            {error && (message === LOADING_FLAT || !message) ? (
              <ErrorContent error={errorContent} message={errorMessage} placement={placement} />
            ) : (
              <MessageContent
                editing={editing}
                id={id}
                message={message}
                messageExtra={
                  <>
                    {errorContent && (
                      <ErrorContent
                        error={errorContent}
                        message={errorMessage}
                        placement={placement}
                      />
                    )}
                    <AssistantMessageExtra
                      content={content}
                      extra={extra}
                      id={id}
                      metadata={metadata}
                      tools={tools}
                    />
                  </>
                }
                placement={placement}
                renderMessage={renderMessage}
                variant={variant}
              />
            )}
          </Flexbox>
          {!disableEditing && (
            <Flexbox align={'flex-start'} className={styles.actions} role="menubar">
              <AssistantActionsBar data={props} id={id} index={index} />
            </Flexbox>
          )}
        </Flexbox>
      </Flexbox>
      {mobile && <BorderSpacing borderSpacing={MOBILE_AVATAR_SIZE} />}
    </Flexbox>
  );
});

export default AssistantMessage;
