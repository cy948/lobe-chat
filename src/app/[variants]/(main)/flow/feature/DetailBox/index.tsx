import { useFlowStore } from '@/store/flow';

import { createStyles } from 'antd-style';

import Header from './Header';
import ChatList from './ChatList';
import ChatInput from './ChatInput';
import { Flexbox } from 'react-layout-kit';

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
        <Flexbox>
            <Header title='title' />
            <Flexbox height={'100%'}>
                <ChatList />
            </Flexbox>
            {/* <Input
                    value={inputMessage}
                    onInput={(e) => setInputMessage(e.target.value)}
                    onPressEnter={() => {
                        sendMessage();
                    }}
                    disabled={isCreateingMessage}
                /> */}
            <ChatInput />
        </Flexbox>
    );
}
