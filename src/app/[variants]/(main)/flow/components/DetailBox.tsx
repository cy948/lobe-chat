import { useFlowStore } from '@/store/flow';
import { Row, Col, Input } from 'antd'

import { createStyles } from 'antd-style';


interface DetailBoxProps {

}

const useStyles = createStyles(({ css, token, isDarkMode }) => {
    return {
        chatBoxInput: {
            position: 'absolute',
            bottom: 24,
            width: '100%',
            padding: '0 24px',
        }
    }
});


export default function DetailBox(props: DetailBoxProps) {
    const { styles } = useStyles();
    const [inputMessage, setInputMessage] = useFlowStore(s => [s.inputMessage, s.setInputMessage]);

    return (
        <Row className={styles.chatBoxInput} gutter={16}>
            <Input
                value={inputMessage}
                onInput={(e) => setInputMessage(e.target.value)}
                onPressEnter={() => {
                    // fetchAIResponse();
                }}
            />
        </Row>
    );
}
