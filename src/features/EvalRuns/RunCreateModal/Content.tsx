'use client';

import { AGENT_PROFILE_URL, DEFAULT_INBOX_AVATAR, INBOX_SESSION_ID } from '@lobechat/const';
import type { AgentEvalRunDetail } from '@lobechat/types';
import { Accordion, AccordionItem, ActionIcon, Avatar, Flexbox, Text } from '@lobehub/ui';
import { Select, useModalContext } from '@lobehub/ui/base-ui';
import { Form, Input, InputNumber, Space } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { SquareArrowOutUpRight } from 'lucide-react';
import { type FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { agentService } from '@/services/agent';
import { runSelectors, useEvalStore } from '@/store/eval';

const DEFAULT_MAX_STEPS = 100;
const DEFAULT_TIMEOUT_MINUTES = 30;
const MAX_TIMEOUT_MINUTES = 240;

const formatRunNameTimestamp = () => {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes(),
  ).padStart(2, '0')}`;
};

const getForkRunConfig = (run?: AgentEvalRunDetail) => ({
  k: run?.config?.k ?? 1,
  maxSteps: run?.config?.maxSteps ?? DEFAULT_MAX_STEPS,
  timeoutMinutes: Math.round(
    ((run?.config?.timeout as number | undefined) ?? DEFAULT_TIMEOUT_MINUTES * 60_000) / 60_000,
  ),
});

const getDefaultRunName = (params: {
  datasetName?: string;
  isForkMode: boolean;
  parentRunName?: string;
}) => {
  const timestamp = formatRunNameTimestamp();

  if (params.isForkMode && params.parentRunName) return `${params.parentRunName} / ${timestamp}`;
  if (params.datasetName) return `${params.datasetName} / ${timestamp}`;

  return timestamp;
};

const styles = createStaticStyles(({ css }) => ({
  agentSelect: css`
    .ant-select-content-value {
      height: 22px !important;
    }
  `,
  hint: css`
    display: inline-block;
    margin-block-start: 4px;
    font-size: ${cssVar.fontSizeSM};
    color: ${cssVar.colorTextQuaternary};
  `,
  timestampLink: css`
    cursor: pointer;

    display: inline-block;

    margin-block-start: 4px;

    font-size: ${cssVar.fontSizeSM};

    transition: color 0.15s ease;

    &:hover {
      color: ${cssVar.colorText};
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  `,
}));

interface AgentOption {
  avatar?: string | null;
  backgroundColor?: string | null;
  description?: string | null;
  id: string;
  title?: string | null;
}

export interface RunCreateContentProps {
  benchmarkId: string;
  datasetId?: string;
  datasetName?: string;
  experimentId?: string;
  onLoadingChange?: (loading: boolean) => void;
  onSubmitReady: (submit: (shouldStart: boolean) => Promise<void>) => void;
  parentRunId?: string;
  parentRunName?: string;
}

const RunCreateContent: FC<RunCreateContentProps> = ({
  benchmarkId,
  datasetId,
  datasetName,
  experimentId,
  onLoadingChange,
  onSubmitReady,
  parentRunId,
}) => {
  const { t } = useTranslation('eval');
  const { t: tChat } = useTranslation('chat');
  const { close } = useModalContext();
  const navigate = useWorkspaceAwareNavigate();
  const createRun = useEvalStore((s) => s.createRun);
  const startRun = useEvalStore((s) => s.startRun);
  const datasetList = useEvalStore((s) => s.datasetList);
  const useFetchRunDetail = useEvalStore((s) => s.useFetchRunDetail);
  const refreshRunDetail = useEvalStore((s) => s.refreshRunDetail);
  const parentRunDetail = useEvalStore(runSelectors.getRunDetailById(parentRunId || ''));
  const [form] = Form.useForm();
  const kValue = Form.useWatch('k', form) ?? 1;

  const isDatasetMode = !!datasetId && !!datasetName;
  const isForkMode = !!parentRunId;

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  useEffect(() => {
    setLoadingAgents(true);
    agentService
      .queryAgents()
      .then((list) => setAgents(list as AgentOption[]))
      .finally(() => setLoadingAgents(false));
  }, []);

  useEffect(() => {
    if (datasetId && !isDatasetMode) {
      form.setFieldsValue({ datasetId });
    }
  }, [datasetId, isDatasetMode, form]);

  useEffect(() => {
    if (form.getFieldValue('name')) return;

    form.setFieldsValue({
      name: getDefaultRunName({
        datasetName,
        isForkMode,
        parentRunName: parentRunName || parentRunDetail?.name || undefined,
      }),
    });
  }, [datasetName, isForkMode, parentRunName, parentRunDetail, form]);

  useEffect(() => {
    if (!isForkMode) return;

    void refreshRunDetail(parentRunId);
  }, [isForkMode, parentRunId, refreshRunDetail]);

  useFetchRunDetail(isForkMode ? parentRunId || '' : '');

  useEffect(() => {
    if (!isForkMode) return;

    const nextForkConfig = getForkRunConfig(parentRunDetail);
    form.setFieldsValue({
      datasetId: parentRunDetail?.datasetId || datasetId,
      k: nextForkConfig.k,
      maxSteps: nextForkConfig.maxSteps,
      timeoutMinutes: nextForkConfig.timeoutMinutes,
    });
  }, [isForkMode, datasetId, parentRunDetail, form]);

  const inboxAgent: AgentOption = useMemo(
    () => ({
      avatar: DEFAULT_INBOX_AVATAR,
      id: INBOX_SESSION_ID,
      title: tChat('inbox.title'),
    }),
    [tChat],
  );

  const allAgents = useMemo(() => [inboxAgent, ...agents], [inboxAgent, agents]);
  const forkSnapshot = parentRunDetail?.config?.agentSnapshot;
  const forkAgentTitle = parentRunDetail?.targetAgent?.title || t('run.detail.agent.unnamed');
  const forkAgentAvatar = forkSnapshot?.avatar || parentRunDetail?.targetAgent?.avatar;
  const forkAgentModel = forkSnapshot?.model || parentRunDetail?.targetAgent?.model;
  const forkAgentProvider = forkSnapshot?.provider || parentRunDetail?.targetAgent?.provider;
  const forkDatasetLabel =
    parentRunDetail?.dataset?.name || datasetName || parentRunDetail?.datasetId || datasetId;

  const agentOptions = useMemo(
    () =>
      allAgents.map((agent) => ({
        label: (
          <span style={{ alignItems: 'center', display: 'inline-flex', gap: 8 }}>
            <Avatar
              avatar={agent.avatar || undefined}
              background={agent.backgroundColor || undefined}
              size={20}
              title={agent.title || ''}
            />
            <span>{agent.title}</span>
          </span>
        ),
        title: agent.title || '',
        value: agent.id,
      })),
    [allAgents],
  );

  const handleOpenAgent = useCallback((agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    window.open(AGENT_PROFILE_URL(agentId), `agent_${agentId}`, 'noopener,noreferrer');
  }, []);

  const submit = useCallback(
    async (shouldStart: boolean) => {
      let values;
      try {
        values = await form.validateFields();
      } catch {
        return;
      }
      onLoadingChange?.(true);
      try {
        const run = await createRun({
          config: isForkMode
            ? undefined
            : {
                k: values.k ?? 1,
                maxSteps: values.maxSteps ?? DEFAULT_MAX_STEPS,
                timeout: (values.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES) * 60_000,
              },
          datasetId: isForkMode
            ? parentRunDetail?.datasetId || datasetId
            : isDatasetMode
              ? datasetId
              : values.datasetId,
          experimentId,
          name: values.name,
          parentRunId,
          targetAgentId: isForkMode ? undefined : values.targetAgentId,
        });
        if (run?.id) {
          if (shouldStart) {
            await startRun(run.id);
          }
          navigate(`/eval/bench/${benchmarkId}/runs/${run.id}`);
        }
        close();
      } finally {
        onLoadingChange?.(false);
      }
    },
    [
      benchmarkId,
      close,
      createRun,
      datasetId,
      form,
      experimentId,
      isForkMode,
      isDatasetMode,
      navigate,
      onLoadingChange,
      parentRunDetail,
      parentRunId,
      startRun,
    ],
  );

  useEffect(() => {
    onSubmitReady(submit);
  }, [onSubmitReady, submit]);

  return (
    <Form form={form} layout="vertical">
      <Form.Item
        label={t('run.create.name')}
        name="name"
        rules={[{ message: t('run.create.name.required'), required: true }]}
        extra={
          <Text
            className={styles.timestampLink}
            type="secondary"
            onClick={() => {
              form.setFieldsValue({ name: formatRunNameTimestamp() });
            }}
          >
            {t('run.create.name.useTimestamp')}
          </Text>
        }
      >
        <Input placeholder={t('run.create.name.placeholder')} variant="filled" />
      </Form.Item>

      <Form.Item
        label={t('run.create.agent')}
        name="targetAgentId"
        rules={
          isForkMode ? undefined : [{ message: t('run.create.agent.required'), required: true }]
        }
      >
        {isForkMode ? (
          <Flexbox
            horizontal
            align="center"
            gap={8}
            style={{
              minHeight: 40,
              paddingBlock: 8,
              paddingInline: 12,
              border: '1px solid var(--ant-color-border-secondary)',
              borderRadius: 8,
              background: 'var(--ant-color-fill-tertiary)',
            }}
          >
            <Avatar avatar={forkAgentAvatar} size={20} />
            <Text>{forkAgentTitle}</Text>
            {forkAgentModel && (
              <Text type="secondary">
                {forkAgentProvider ? `${forkAgentProvider} / ` : ''}
                {forkAgentModel}
              </Text>
            )}
          </Flexbox>
        ) : (
          <Select
            allowClear
            showSearch
            className={styles.agentSelect}
            loading={loadingAgents}
            options={agentOptions}
            placeholder={t('run.create.agent.placeholder')}
            variant="filled"
            optionRender={(option) => (
              <span
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'space-between',
                }}
              >
                {option.label}
                <ActionIcon
                  icon={SquareArrowOutUpRight}
                  size="small"
                  onClick={(e) => handleOpenAgent(option.value as string, e)}
                />
              </span>
            )}
          />
        )}
      </Form.Item>

      {(!isDatasetMode || isForkMode) && (
        <Form.Item
          label={t('run.create.dataset')}
          name="datasetId"
          rules={
            isForkMode ? undefined : [{ message: t('run.create.dataset.required'), required: true }]
          }
        >
          {isForkMode ? (
            <Input disabled value={forkDatasetLabel} variant="filled" />
          ) : (
            <Select
              placeholder={t('run.create.dataset.placeholder')}
              variant="filled"
              options={datasetList.map((ds) => ({
                label: (
                  <Space>
                    <span>{ds.name}</span>
                    {ds.testCaseCount !== undefined && (
                      <span style={{ color: cssVar.colorTextQuaternary, fontSize: 12 }}>
                        {t('run.create.caseCount', { count: ds.testCaseCount })}
                      </span>
                    )}
                  </Space>
                ),
                value: ds.id,
              }))}
            />
          )}
        </Form.Item>
      )}

      <Accordion defaultExpandedKeys={[]}>
        <AccordionItem
          itemKey="advanced"
          paddingBlock={8}
          paddingInline={4}
          title={t('run.create.advanced')}
        >
          <Flexbox gap={16} style={{ paddingTop: 8 }}>
            <Form.Item
              extra={<span className={styles.hint}>{t('run.config.k.hint', { k: kValue })}</span>}
              initialValue={1}
              label={t('run.config.k')}
              name="k"
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                disabled={isForkMode}
                max={10}
                min={1}
                step={1}
                style={{ width: '100%' }}
                variant="filled"
              />
            </Form.Item>
            <Form.Item
              extra={<span className={styles.hint}>{t('run.config.maxSteps.hint')}</span>}
              initialValue={DEFAULT_MAX_STEPS}
              label={t('run.config.maxSteps')}
              name="maxSteps"
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                disabled={isForkMode}
                max={1000}
                min={1}
                step={10}
                style={{ width: '100%' }}
                variant="filled"
              />
            </Form.Item>
            <Form.Item
              initialValue={DEFAULT_TIMEOUT_MINUTES}
              label={t('run.config.timeout')}
              name="timeoutMinutes"
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                disabled={isForkMode}
                max={MAX_TIMEOUT_MINUTES}
                min={1}
                style={{ width: '100%' }}
                suffix={t('run.config.timeout.unit')}
                variant="filled"
              />
            </Form.Item>
          </Flexbox>
        </AccordionItem>
      </Accordion>
    </Form>
  );
};

export default RunCreateContent;
