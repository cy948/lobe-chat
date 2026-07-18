'use client';

import type { EvalMode, EvalTestCaseContent, EvalTestCaseMetadata } from '@lobechat/types';
import type { SegmentedProps } from '@lobehub/ui';
import { Center, Flexbox, Icon, Text } from '@lobehub/ui';
import { Segmented } from '@lobehub/ui';
import { Select, useModalContext } from '@lobehub/ui/base-ui';
import { App, Form, Input } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { type FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FormSliderWithInput } from '@/components/FormInput';
import { agentEvalService } from '@/services/agentEval';
import { uploadService } from '@/services/upload';

import { DATASET_PRESETS, getPresetsByCategory } from '../datasetPresets';
import { autoInferMapping, type MappingTarget } from '../DatasetImportModal/MappingStep';

const toIdentifier = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, '-')
    .replaceAll(/[^\da-z-]/g, '');

const createForkSuffix = () => Math.random().toString(36).slice(2, 6);

const createForkName = (name: string) => `${name} subset ${createForkSuffix()}`;

const CATEGORY_LABELS: Record<string, string> = {
  'custom': 'Custom',
  'memory': 'Memory',
  'reference': 'Reference Formats',
  'research': 'Deep Research / QA',
  'tool-use': 'Tool Use',
};

interface ForkableTestCase {
  content: EvalTestCaseContent;
  evalConfig?: { judgePrompt?: string } | null;
  evalMode?: EvalMode | null;
  metadata?: EvalTestCaseMetadata | null;
  sortOrder?: number | null;
}

interface ForkSourceDataset {
  evalConfig?: { judgePrompt?: string } | null;
  evalMode?: EvalMode | null;
  metadata?: Record<string, unknown> | null;
  name: string;
  testCases: ForkableTestCase[];
}

const getPresetId = (metadata?: Record<string, unknown> | null) => {
  const preset = metadata?.preset;

  return typeof preset === 'string' && preset.length > 0 ? preset : 'custom';
};

const getFilteredTestCases = (testCases: ForkableTestCase[], categories: string[]) => {
  if (categories.length === 0) return testCases;

  return testCases.filter((testCase) => {
    const category = testCase.content.category;
    return typeof category === 'string' && categories.includes(category);
  });
};

const sampleTestCases = (testCases: ForkableTestCase[], sampleSize: number) => {
  if (sampleSize <= 0 || testCases.length === 0) return [];
  if (sampleSize >= testCases.length) return testCases;

  const items = testCases.map((testCase, index) => ({ index, testCase }));

  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return items
    .slice(0, sampleSize)
    .sort((a, b) => {
      const left = a.testCase.sortOrder ?? a.index;
      const right = b.testCase.sortOrder ?? b.index;

      return left - right;
    })
    .map((item) => item.testCase);
};

const styles = createStaticStyles(({ css }) => ({
  presetIcon: css`
    border: 1px solid ${cssVar.colorFillTertiary};
    border-radius: ${cssVar.borderRadius};
    background: ${cssVar.colorBgElevated};
  `,
}));

export interface DatasetCreateContentProps {
  benchmarkId?: string;
  benchmarkOptions?: { id: string; name: string }[];
  defaultMode?: 'empty' | 'fork';
  defaultSourceDatasetDraft?: {
    evalMode?: EvalMode | null;
    metadata?: Record<string, unknown> | null;
    name: string;
    testCaseCount?: number;
  };
  defaultSourceDatasetId?: string;
  experimentDatasets?: Array<{ benchmarkId: string; id: string; name: string }>;
  formId: string;
  onLoadingChange?: (loading: boolean) => void;
  onImportRequest?: (payload: {
    datasetId: string;
    importState?: {
      filename?: string;
      format: 'csv' | 'json' | 'jsonl' | 'xlsx';
      headers: string[];
      mapping: Record<string, MappingTarget>;
      pathname: string;
      preview: Record<string, unknown>[];
      totalCount: number;
    };
    preset: string;
  }) => void;
  onSuccess?: (dataset: { id: string; name: string; preset: string }) => void;
  sourceExperimentId?: string;
}

const DatasetCreateContent: FC<DatasetCreateContentProps> = ({
  benchmarkId,
  benchmarkOptions,
  defaultMode,
  defaultSourceDatasetDraft,
  defaultSourceDatasetId,
  experimentDatasets,
  formId,
  onLoadingChange,
  onImportRequest,
  onSuccess,
  sourceExperimentId,
}) => {
  const { t } = useTranslation('eval');
  const { close } = useModalContext();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [mode, setMode] = useState<'empty' | 'fork'>('empty');
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [sourceDataset, setSourceDataset] = useState<ForkSourceDataset | null>(null);
  const [sourceDatasetLoading, setSourceDatasetLoading] = useState(false);

  const benchmarkValue = Form.useWatch('benchmarkId', form);
  const rawCategoryFilters = Form.useWatch('categoryFilters', form);
  const nameValue = Form.useWatch('name', form);
  const evalModeValue = Form.useWatch('evalMode', form);
  const samplingCount = Form.useWatch('samplingCount', form);
  const sourceDatasetId = Form.useWatch('sourceDatasetId', form);
  const categoryFilters = useMemo(
    () => (Array.isArray(rawCategoryFilters) ? rawCategoryFilters : []),
    [rawCategoryFilters],
  );

  useEffect(() => {
    if (!identifierTouched && nameValue) {
      form.setFieldValue('identifier', toIdentifier(nameValue));
    }
  }, [nameValue, identifierTouched, form]);

  useEffect(() => {
    setMode(defaultMode || 'empty');
    setSourceDataset(null);
    form.setFieldValue('sourceDatasetId', defaultSourceDatasetId);

    if (defaultMode === 'fork' && defaultSourceDatasetDraft) {
      const nextPresetId = getPresetId(defaultSourceDatasetDraft.metadata);
      const nextName = createForkName(defaultSourceDatasetDraft.name);

      setSelectedPreset(nextPresetId);
      form.setFieldValue('categoryFilters', []);
      form.setFieldValue('evalMode', defaultSourceDatasetDraft.evalMode || undefined);
      form.setFieldValue('identifier', toIdentifier(nextName));
      form.setFieldValue('name', nextName);
      form.setFieldValue('samplingCount', defaultSourceDatasetDraft.testCaseCount || 0);
    }
  }, [defaultMode, defaultSourceDatasetDraft, defaultSourceDatasetId, form]);

  useEffect(() => {
    if (!sourceExperimentId) return;

    form.setFieldValue(
      'sourceDatasetId',
      benchmarkId && defaultSourceDatasetId ? defaultSourceDatasetId : undefined,
    );
    form.setFieldValue('categoryFilters', []);
    form.setFieldValue('samplingCount', undefined);
    setSourceDataset(null);
  }, [benchmarkId, benchmarkValue, defaultSourceDatasetId, form, sourceExperimentId]);

  useEffect(() => {
    if (!sourceExperimentId || mode !== 'fork' || !sourceDatasetId) {
      setSourceDataset(null);
      setSourceDatasetLoading(false);
      return;
    }

    let active = true;

    setSourceDatasetLoading(true);

    agentEvalService
      .getDataset(sourceDatasetId as string)
      .then((dataset) => {
        if (!active) return;

        const nextPresetId = getPresetId(dataset.metadata);
        const nextName = createForkName(dataset.name);
        const nextDataset = {
          evalConfig: dataset.evalConfig,
          evalMode: dataset.evalMode,
          metadata: dataset.metadata,
          name: dataset.name,
          testCases: (dataset.testCases || []) as ForkableTestCase[],
        } satisfies ForkSourceDataset;

        setSelectedPreset(nextPresetId);
        setSourceDataset(nextDataset);
        form.setFieldValue('categoryFilters', []);
        form.setFieldValue('evalMode', dataset.evalMode || undefined);
        form.setFieldValue('identifier', toIdentifier(nextName));
        form.setFieldValue('name', nextName);
        form.setFieldValue('samplingCount', nextDataset.testCases.length);
      })
      .catch((error) => {
        if (!active) return;
        setSelectedPreset('custom');
        setSourceDataset(null);
        form.setFieldValue('categoryFilters', []);
        form.setFieldValue('evalMode', undefined);
        form.setFieldValue('samplingCount', undefined);
        message.error(error.message || t('dataset.create.error'));
      })
      .finally(() => {
        if (active) {
          setSourceDatasetLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [form, message, mode, sourceDatasetId, sourceExperimentId, t]);

  const availableCategories = useMemo(() => {
    const categories = new Set<string>();

    for (const testCase of sourceDataset?.testCases || []) {
      const category = testCase.content.category;
      if (typeof category === 'string' && category.length > 0) {
        categories.add(category);
      }
    }

    return [...categories];
  }, [sourceDataset]);

  const filteredSourceTestCases = useMemo(
    () => getFilteredTestCases(sourceDataset?.testCases || [], categoryFilters),
    [categoryFilters, sourceDataset],
  );

  useEffect(() => {
    if (!sourceExperimentId || mode !== 'fork' || sourceDatasetLoading || !sourceDataset) return;

    const maxSamplingCount = filteredSourceTestCases.length;

    if (maxSamplingCount === 0) {
      if (samplingCount !== 0) {
        form.setFieldValue('samplingCount', 0);
      }

      return;
    }

    if (typeof samplingCount !== 'number' || samplingCount > maxSamplingCount) {
      form.setFieldValue('samplingCount', maxSamplingCount);
    }
  }, [
    filteredSourceTestCases.length,
    form,
    mode,
    samplingCount,
    sourceDataset,
    sourceDatasetLoading,
    sourceExperimentId,
  ]);

  const selectedBenchmarkId = benchmarkId || benchmarkValue;
  const sourceDatasetOptions = useMemo(() => {
    if (!sourceExperimentId || !selectedBenchmarkId) return [];

    return (experimentDatasets || [])
      .filter((dataset) => dataset.benchmarkId === selectedBenchmarkId)
      .map((dataset) => ({
        label: dataset.name,
        value: dataset.id,
      }));
  }, [experimentDatasets, selectedBenchmarkId, sourceExperimentId]);

  const handleFinish = async (values: any) => {
    onLoadingChange?.(true);
    try {
      const nextBenchmarkId = benchmarkId || values.benchmarkId;
      const inheritedPreset = getPresetId(sourceDataset?.metadata);
      const nextMode =
        sourceExperimentId && mode === 'fork' ? sourceDataset?.evalMode : values.evalMode;
      const nextEvalConfig =
        sourceExperimentId && mode === 'fork'
          ? sourceDataset?.evalConfig || undefined
          : values.evalConfig?.judgePrompt
            ? values.evalConfig
            : undefined;

      const result = await agentEvalService.createDataset({
        benchmarkId: nextBenchmarkId,
        description: mode === 'empty' ? values.description : undefined,
        evalConfig: nextEvalConfig,
        evalMode: nextMode || undefined,
        identifier: values.identifier.trim(),
        metadata: {
          preset: mode === 'empty' ? selectedPreset : inheritedPreset,
        },
        name: values.name,
        sourceExperimentId,
      });

      if (sourceExperimentId && mode === 'fork' && sourceDatasetId) {
        const sourceTestCases = sampleTestCases(
          filteredSourceTestCases,
          typeof values.samplingCount === 'number'
            ? values.samplingCount
            : filteredSourceTestCases.length,
        );

        const importRows = sourceTestCases.map((testCase, index) => ({
          category: testCase.content.category,
          choices: testCase.content.choices?.join(' | '),
          expected: testCase.content.expected,
          input: testCase.content.input,
          sortOrder: testCase.sortOrder ?? index + 1,
        }));
        const file = new File(
          [JSON.stringify(importRows, null, 2)],
          `${values.identifier.trim() || result.identifier}.json`,
          { type: 'application/json' },
        );
        const metadata = await uploadService.uploadToServerS3(file, {
          directory: 'eval-datasets',
        });
        const parsed = await agentEvalService.parseDatasetFile({
          filename: file.name,
          pathname: metadata.path,
        });

        close();
        onSuccess?.({
          id: result.id,
          name: result.name,
          preset: inheritedPreset,
        });
        onImportRequest?.({
          datasetId: result.id,
          importState: {
            filename: file.name,
            format: parsed.format as 'csv' | 'json' | 'jsonl' | 'xlsx',
            headers: parsed.headers,
            mapping: autoInferMapping(parsed.headers),
            pathname: metadata.path,
            preview: parsed.preview,
            totalCount: parsed.totalCount,
          },
          preset: inheritedPreset,
        });

        return;
      }

      close();
      onSuccess?.({
        id: result.id,
        name: result.name,
        preset: mode === 'empty' ? selectedPreset : inheritedPreset,
      });
    } catch (error: any) {
      message.error(error?.message || t('dataset.create.error'));
    } finally {
      onLoadingChange?.(false);
    }
  };

  const presetsByCategory = getPresetsByCategory();
  const currentPreset = DATASET_PRESETS[selectedPreset];
  const isExperimentScoped = !!sourceExperimentId;
  const isForkMode = isExperimentScoped && mode === 'fork';
  const shouldChooseBenchmark = !benchmarkId && benchmarkOptions && benchmarkOptions.length > 0;
  const sourcePresetId = getPresetId(sourceDataset?.metadata);
  const sourcePreset = DATASET_PRESETS[sourcePresetId];

  const selectOptions = Object.entries(presetsByCategory)
    .filter(([_, presets]) => presets.length > 0)
    .map(([category, presets]) => ({
      label: CATEGORY_LABELS[category] || category,
      options: presets.map((preset) => ({
        label: preset.name,
        value: preset.id,
      })),
    }));

  return (
    <Form form={form} layout="vertical" name={formId} onFinish={handleFinish}>
      {isExperimentScoped && (
        <Segmented
          block
          style={{ marginBottom: 16 }}
          value={mode}
          options={
            [
              { label: t('dataset.create.mode.empty'), value: 'empty' },
              { label: t('dataset.create.mode.fork'), value: 'fork' },
            ] satisfies SegmentedProps['options']
          }
          onChange={(value) => {
            setMode(value as 'empty' | 'fork');
            form.setFieldValue('sourceDatasetId', undefined);
            form.setFieldValue('categoryFilters', []);
            form.setFieldValue('samplingCount', undefined);
            setSourceDataset(null);
          }}
        />
      )}

      {shouldChooseBenchmark && (
        <Form.Item
          label={t('dataset.create.benchmark.label')}
          name="benchmarkId"
          rules={[{ message: t('dataset.create.benchmarkRequired'), required: true }]}
        >
          <Select
            options={benchmarkOptions.map((benchmark) => ({
              label: benchmark.name,
              value: benchmark.id,
            }))}
            placeholder={t('dataset.create.benchmark.placeholder')}
          />
        </Form.Item>
      )}

      {isForkMode && (
        <Form.Item
          label={t('dataset.create.sourceDataset.label')}
          name="sourceDatasetId"
          rules={[{ message: t('dataset.create.sourceDataset.required'), required: true }]}
        >
          <Select
            disabled={!selectedBenchmarkId}
            options={sourceDatasetOptions}
            placeholder={t('dataset.create.sourceDataset.placeholder')}
          />
        </Form.Item>
      )}

      <Form.Item
        label={t('dataset.create.name.label')}
        name="name"
        rules={[{ message: t('dataset.create.nameRequired'), required: true }]}
      >
        <Input placeholder={t('dataset.create.name.placeholder')} />
      </Form.Item>

      <Form.Item
        label={t('dataset.create.identifier.label')}
        name="identifier"
        rules={[{ message: t('dataset.create.identifierRequired'), required: true }]}
      >
        <Input
          placeholder={t('dataset.create.identifier.placeholder')}
          onChange={() => setIdentifierTouched(true)}
        />
      </Form.Item>

      <Form.Item
        hidden={isForkMode}
        label={t('dataset.create.description.label')}
        name="description"
      >
        <Input.TextArea placeholder={t('dataset.create.description.placeholder')} rows={3} />
      </Form.Item>

      <Form.Item extra={t('dataset.evalMode.hint')} label={t('evalMode.label')} name="evalMode">
        <Select
          allowClear
          placeholder={t('evalMode.placeholder')}
          optionRender={(option) => (
            <Flexbox gap={2} style={{ padding: '4px 0' }}>
              <div>{option.label}</div>
              <Text style={{ fontSize: 12 }} type="secondary">
                {t(`evalMode.${option.value}.desc` as any)}
              </Text>
            </Flexbox>
          )}
          options={[
            { label: t('evalMode.equals'), value: 'equals' },
            { label: t('evalMode.contains'), value: 'contains' },
            { label: t('evalMode.llm-rubric'), value: 'llm-rubric' },
            { label: t('evalMode.external'), value: 'external' },
          ]}
        />
      </Form.Item>

      {evalModeValue === 'llm-rubric' && (
        <Form.Item label={t('evalMode.prompt.label')} name={['evalConfig', 'judgePrompt']}>
          <Input.TextArea placeholder={t('evalMode.prompt.placeholder')} rows={3} />
        </Form.Item>
      )}

      {isForkMode && (
        <Form.Item
          extra={t('dataset.create.fork.filter.hint')}
          label={t('dataset.create.fork.filter.label')}
          name="categoryFilters"
        >
          <Select
            allowClear
            mode="multiple"
            options={availableCategories.map((category) => ({
              label: category,
              value: category,
            }))}
            placeholder={t('dataset.create.fork.filter.placeholder')}
          />
        </Form.Item>
      )}

      {isForkMode && (
        <Form.Item
          extra={t('dataset.create.fork.sampling.hint', {
            count: filteredSourceTestCases.length,
          })}
          label={t('dataset.create.fork.sampling.label')}
          name="samplingCount"
        >
          <FormSliderWithInput
            disabled={filteredSourceTestCases.length === 0 || sourceDatasetLoading}
            max={filteredSourceTestCases.length}
            min={0}
            step={1}
          />
        </Form.Item>
      )}

      <Form.Item
        label={t('dataset.create.preset.label')}
        extra={
          (isForkMode ? sourcePreset : currentPreset) ? (
            <Flexbox gap={4} style={{ marginTop: 8 }}>
              <p style={{ color: cssVar.colorTextSecondary, fontSize: 12, margin: 0 }}>
                {(isForkMode ? sourcePreset : currentPreset)?.formatDescription}
              </p>
              <div style={{ color: cssVar.colorTextTertiary, fontSize: 12 }}>
                <strong>Required:</strong>{' '}
                {(isForkMode ? sourcePreset : currentPreset)?.requiredFields.join(', ')}
                {((isForkMode ? sourcePreset : currentPreset)?.optionalFields.length || 0) > 0 && (
                  <>
                    {' · '}
                    <strong>Optional:</strong>{' '}
                    {(isForkMode ? sourcePreset : currentPreset)?.optionalFields.join(', ')}
                  </>
                )}
              </div>
            </Flexbox>
          ) : null
        }
      >
        <Select
          disabled={isForkMode}
          options={selectOptions}
          placeholder="Select a preset"
          value={selectedPreset}
          optionRender={(option) => {
            const preset = DATASET_PRESETS[option.value as string];
            if (!preset) return option.label;

            return (
              <Flexbox
                horizontal
                align="flex-start"
                gap={12}
                style={{ overflow: 'hidden', width: '100%' }}
              >
                <Center className={styles.presetIcon} flex="none" height={40} width={40}>
                  <Icon icon={preset.icon} size={18} />
                </Center>
                <Flexbox flex={1} gap={2} style={{ minWidth: 0, overflow: 'hidden' }}>
                  <Text ellipsis style={{ fontSize: 14, fontWeight: 500 }}>
                    {preset.name}
                  </Text>
                  <Text ellipsis style={{ fontSize: 12 }} type="secondary">
                    {preset.description}
                  </Text>
                </Flexbox>
              </Flexbox>
            );
          }}
          onChange={(value) => setSelectedPreset(value)}
        />
      </Form.Item>
    </Form>
  );
};

export default DatasetCreateContent;
