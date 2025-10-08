import { createStyles } from 'antd-style';


import Header from './Header';
import ChatList from './ChatList';
import ChatInput from './ChatInput';
import Summary from './Summary';
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

    return (
        <Flexbox height={'100%'}>
            <Header title='title' />
            <Flexbox height={'100%'}>
                <Summary />
                <ChatList />
            </Flexbox>
            <ChatInput />
        </Flexbox>
    );
}
