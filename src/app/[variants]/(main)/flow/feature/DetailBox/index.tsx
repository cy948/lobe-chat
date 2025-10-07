import { useFlowStore } from '@/store/flow';
import { Row, Col, Input } from 'antd'

import { createStyles } from 'antd-style';

import Header from './Header';
import ChatList from './ChatList';

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
    const [
        inputMessage, 
        setInputMessage,
        sendMessage,
        isCreateingMessage,
    ] = useFlowStore(s => [
        s.inputMessage, 
        s.setInputMessage, 
        s.sendMessage,
        s.isCreateingMessage,
    ]);

    return (
        <>
            <Row>
                <Header title='title' />
            </Row>
            <Row className={styles.chatBoxInput} gutter={16}>
                <ChatList />
                <Input
                    value={inputMessage}
                    onInput={(e) => setInputMessage(e.target.value)}
                    onPressEnter={() => {
                        sendMessage();
                    }}
                    disabled={isCreateingMessage}
                />
            </Row>
        </>
    );
}
