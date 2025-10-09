'use client';

import { createStyles } from 'antd-style';
import { Flexbox } from 'react-layout-kit';

import FlowCanvas from './components/FlowCanvas';
import PortalPanel from './components/PortalPanel';
import DetailBox from './feature/DetailBox';

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
        <PortalPanel>
          <DetailBox />
        </PortalPanel>
      </Flexbox>
    </div>
  );
};

export default FlowPage;
