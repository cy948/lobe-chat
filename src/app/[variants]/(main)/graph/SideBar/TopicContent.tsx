import { Text } from '@lobehub/ui';
import { createStyles } from 'antd-style';
import { memo } from 'react';
import { Flexbox } from 'react-layout-kit';

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

const TopicContent = memo<TopicContentProps>(({ title }) => {
  const { styles } = useStyles();

  return (
    <Flexbox align={'center'} gap={8} horizontal justify={'space-between'}>
      <Text
        className={styles.title}
        ellipsis={{ rows: 1, tooltip: { placement: 'left', title } }}
        style={{ margin: 0 }}
      >
        {title}
      </Text>
    </Flexbox>
  );
});

export default TopicContent;
