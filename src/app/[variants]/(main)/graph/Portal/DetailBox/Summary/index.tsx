import { ActionIcon, Button, Collapse, CollapseProps, Tag } from '@lobehub/ui';
import { Switch } from 'antd';
import { RotateCcwIcon, SettingsIcon } from 'lucide-react';
import { Flexbox } from 'react-layout-kit';

import { portalSelectors, useGraphStore } from '@/store/graph';

import SummaryDetail from './SummaryDetail';
import { useCallback } from 'react';

export default function NodeSummary({ id }: { id?: string }) {
  const [
    isGeneratingSummary,
    generateHistorySummary,
    nodeMeta,
    updateNodeMeta,
  ] = useGraphStore((s) => [
    s.isGeneratingSummary,
    s.generateHistorySummary,
    portalSelectors.getActiveNodeMeta(s),
    s.updateNodeMeta,
  ]);


  const generateSummary = useCallback(async () => {
    if (isGeneratingSummary) return;
    await generateHistorySummary();
  }, []);

  const handleUseSummary = useCallback(async (checked: boolean) => {
    if (!id) return
    await updateNodeMeta(id, { useSummary: checked });
  }, [id, updateNodeMeta])

  const items: CollapseProps['items'] = [
    {
      children: <SummaryDetail />,
      // desc: 'The summary of this panel [Will be put into chat context]',
      extra: (
        <Flexbox gap={16} horizontal>
          <Flexbox align="center" gap={8} horizontal>
            {!nodeMeta?.isLatestSummary && <Tag color="warning">Summary Outdated</Tag>}
            Use Summary
            <Switch onChange={(checked) => handleUseSummary(checked)} value={nodeMeta?.useSummary} />
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
