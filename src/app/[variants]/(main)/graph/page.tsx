'use client';

import { createStyles } from 'antd-style';
import { Flexbox } from 'react-layout-kit';

import FlowCanvas from './Canvas';
import GraphChatHeader from './Header';
import Portal from './Portal';
import SideBar from './SideBar';

const useStyles = createStyles(({ token, isDarkMode }) => {
  return {
    canvasBox: {
      height: '95vh',
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
      <GraphChatHeader />
      <Flexbox className={styles.canvasBox} horizontal>
        <FlowCanvas />
        <Portal />
        <SideBar />
      </Flexbox>
    </div>
  );
};

export default FlowPage;
