'use client';

import { Row, Col } from 'antd'
import { createStyles } from 'antd-style';

import { useFlowStore } from '@/store/flow';

import FlowCanvas from './components/FlowCanvas';
import DetailBox from './feature/DetailBox';

const useStyles = createStyles(({ css, token, isDarkMode }) => {
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
    const [detailBoxVisible] = useFlowStore(s => [s.detailBoxVisible]);

    return (
        <div className={styles.canvasContainer}>
            <Row className={styles.canvasBox} gutter={16}>
                <Col span={detailBoxVisible ? 16 : 24}>
                    <FlowCanvas />
                </Col>
                <Col span={detailBoxVisible ? 8 : 0}>
                    {detailBoxVisible && <DetailBox />}
                </Col>
            </Row>
        </div>
    );
};

export default FlowPage;