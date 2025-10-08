
import { Flexbox } from 'react-layout-kit';
import { ActionIcon, Button, Collapse, CollapseProps } from '@lobehub/ui'
import { Switch } from 'antd';
import { RotateCcwIcon, SettingsIcon } from 'lucide-react';

import { useFlowStore } from '@/store/flow';

import SummaryDetail from './SummaryDetail';

export default function NodeSummary() {
    const [ isGeneratingSummary, generateHistorySummary ] = useFlowStore((s) => [s.isGeneratingSummary, s.generateHistorySummary]);

    const generateSummary = async () => {
        if (isGeneratingSummary) return;
        await generateHistorySummary();
    }

    const items: CollapseProps['items'] = [
        {
            children: <SummaryDetail />,
            // desc: 'The summary of this panel [Will be put into chat context]',
            extra: (
                <Flexbox horizontal gap={16}>
                    <Flexbox horizontal gap={8} align='center'>
                        Use Summary
                        <Switch defaultValue={true} />
                    </Flexbox>
                    <Flexbox>
                        <Button loading={isGeneratingSummary} icon={RotateCcwIcon} onClick={() => generateSummary()}>
                            Generate
                        </Button>
                    </Flexbox>
                    <ActionIcon
                        icon={SettingsIcon}
                        // If you want to prevent the event from bubbling up,
                        // you can use the stopPropagation method.
                        onClick={(e) => e.stopPropagation()}
                        size={'small'}
                    />
                </Flexbox>
            ),
            key: '1',
            label: 'Summary',
        },
    ]


    return (<Collapse items={items}></Collapse>)
}