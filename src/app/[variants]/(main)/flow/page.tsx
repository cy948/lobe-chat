'use client';

import { createStyles } from 'antd-style';

import FlowCanvas from './components/FlowCanvas';
import PortalPanel from './components/PortalPanel';
import DetailBox from './feature/DetailBox';
import { Flexbox } from 'react-layout-kit';

const useStyles = createStyles(({ token, isDarkMode }) => {
    return {
        canvasContainer: {
            width: '100vw',
            height: '100vh',
            background: isDarkMode ? token.colorBgContainer : '#f0f2f5',
        },
        canvasBox: {
            height: '100vh',
        },
    }
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