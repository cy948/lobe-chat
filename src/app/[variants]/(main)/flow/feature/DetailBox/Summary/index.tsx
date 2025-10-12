import { ActionIcon, Button, Collapse, CollapseProps, Tag } from '@lobehub/ui';
import { Switch } from 'antd';
import { RotateCcwIcon, SettingsIcon } from 'lucide-react';
import { Flexbox } from 'react-layout-kit';

import { canvasSelectors, useFlowStore } from '@/store/flow';

import SummaryDetail from './SummaryDetail';

export default function NodeSummary() {
  const [
    isGeneratingSummary,
    generateHistorySummary,
    useSummary,
    setActiveNodeUseSummary,
    nodeMeta,
  ] = useFlowStore((s) => [
    s.isGeneratingSummary,
    s.generateHistorySummary,
    canvasSelectors.getActiveNodeMeta(s)?.useSummary,
    canvasSelectors.setActiveNodeUseSummary(s),
    canvasSelectors.getActiveNodeMeta(s),
  ]);

  const generateSummary = async () => {
    if (isGeneratingSummary) return;
    await generateHistorySummary();
  };

  const items: CollapseProps['items'] = [
    {
      children: <SummaryDetail />,
      // desc: 'The summary of this panel [Will be put into chat context]',
      extra: (
        <Flexbox gap={16} horizontal>
          <Flexbox align="center" gap={8} horizontal>
            {!nodeMeta?.isLatestSummary && <Tag color="warning">Summary Outdated</Tag>}
            Use Summary
            <Switch onChange={(checked) => setActiveNodeUseSummary(checked)} value={useSummary} />
          </Flexbox>
          <Flexbox>
            <Button
              icon={RotateCcwIcon}
              loading={isGeneratingSummary}
              onClick={() => generateSummary()}
            >
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
  ];

  return <Collapse items={items} />;
}
