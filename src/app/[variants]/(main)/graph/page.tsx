'use client';

import { createStyles } from 'antd-style';
import { Flexbox } from 'react-layout-kit';

import FlowCanvas from './Canvas';
import Portal from './Portal';

const useStyles = createStyles(({ token, isDarkMode }) => {
  return {
    canvasBox: {
      height: '100vh',
    },
    canvasContainer: {
      background: isDarkMode ? token.colorBgContainer : '#f0f2f5',
      height: '100vh',
      width: '100vw',
    },
  };
});

const FlowPage = () => {
  const { styles } = useStyles();
  return (
    <div className={styles.canvasContainer}>
      <Flexbox className={styles.canvasBox} horizontal>
        <FlowCanvas />
        <Portal />
      </Flexbox>
    </div>
  );
};

export default FlowPage;
