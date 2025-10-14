import { ActionIcon } from '@lobehub/ui';
import { useTheme } from 'antd-style';
import { XIcon } from 'lucide-react';
import { memo } from 'react';
import { Flexbox } from 'react-layout-kit';

import SidebarHeader from '@/components/SidebarHeader';
import { useGraphStore } from '@/store/graph';

const Header = memo(({ title }: { title: string }) => {
    const theme = useTheme();
    const [setPortal] = useGraphStore(s => [s.setPortal]);

    return (
        <SidebarHeader
            actions={
                <Flexbox gap={4} horizontal>
                    <ActionIcon icon={XIcon} onClick={() => setPortal(false)} size={'small'} />
                </Flexbox>
            }
            paddingBlock={6}
            paddingInline={8}
            style={{
                borderBottom: `1px solid ${theme.colorBorderSecondary}`,
            }}
            title={title}
        />
    );
});

export default Header;
