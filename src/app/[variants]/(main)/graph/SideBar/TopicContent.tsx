import { ActionIcon, Dropdown, EditableText, Icon, MenuProps, Text } from '@lobehub/ui';
import { createStyles, useTheme } from 'antd-style';
import { MoreVertical, PencilLine, Star } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Flexbox } from 'react-layout-kit';

import { useGraphStore } from '@/store/graph';

const useStyles = createStyles(({ css }) => ({
  content: css`
    position: relative;
    overflow: hidden;
    flex: 1;
  `,
  title: css`
    flex: 1;
    height: 28px;
    line-height: 28px;
    text-align: start;
  `,
}));

interface TopicContentProps {
  fav?: boolean;
  id: string;
  showMore?: boolean;
  title: string;
}

const TopicContent = memo<TopicContentProps>(({ id, title, fav, showMore }) => {
  const { t } = useTranslation(['topic', 'common']);
  const { styles } = useStyles();
  const theme = useTheme();

  const [editing, updateState] = useGraphStore((s) => [s.topicRenamingId === id, s.updateState]);

  const toggleEditing = (visible?: boolean) => {
    useGraphStore.setState({ topicRenamingId: visible ? id : '' });
  };

  const items = useMemo<MenuProps['items']>(
    () => [
      {
        icon: <Icon icon={PencilLine} />,
        key: 'rename',
        label: t('rename', { ns: 'common' }),
        onClick: () => {
          toggleEditing(true);
        },
      },
    ],
    [id],
  );

  return (
    <Flexbox align={'center'} gap={8} horizontal justify={'space-between'}>
      <ActionIcon
        color={fav ? theme.colorWarning : undefined}
        fill={fav ? theme.colorWarning : 'transparent'}
        icon={Star}
        onClick={async (e) => {
          e.stopPropagation();
          if (!id) return;
          // favoriteTopic(id, !fav);
          updateState(id, { favorite: !fav });
        }}
        size={'small'}
        // spin={isLoading}
      />
      {!editing ? (
        <Text
          className={styles.title}
          ellipsis={{ rows: 1, tooltip: { placement: 'left', title } }}
          style={{ margin: 0 }}
        >
          {title}
        </Text>
      ) : (
        <EditableText
          editing={editing}
          onChangeEnd={(v) => {
            if (title !== v) {
              // updateTopicTitle(id, v);
              updateState(id, { title: v });
            }
            toggleEditing(false);
          }}
          onEditingChange={toggleEditing}
          showEditIcon={false}
          style={{ height: 28 }}
          value={title}
        />
      )}
      {showMore && !editing && (
        <Dropdown
          arrow={false}
          menu={{
            items: items,
            onClick: ({ domEvent }) => {
              domEvent.stopPropagation();
            },
          }}
          trigger={['click']}
        >
          <ActionIcon
            className="topic-more"
            icon={MoreVertical}
            onClick={(e) => {
              e.stopPropagation();
            }}
            size={'small'}
          />
        </Dropdown>
      )}
    </Flexbox>
  );
});

export default TopicContent;
