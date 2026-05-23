'use client';

import { Modal } from '@lobehub/ui';
import { App, Form, Input, Select } from 'antd';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { benchmarkSelectors, useEvalStore } from '@/store/eval';

interface ExperimentCreateModalProps {
  onClose: () => void;
  onSuccess?: (id: string) => void;
  open: boolean;
}

const ExperimentCreateModal = memo<ExperimentCreateModalProps>(({ open, onClose, onSuccess }) => {
  const { t } = useTranslation('eval');
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const createExperiment = useEvalStore((s) => s.createExperiment);
  const useFetchBenchmarks = useEvalStore((s) => s.useFetchBenchmarks);
  const benchmarkList = useEvalStore(benchmarkSelectors.benchmarkList);
  const isCreatingExperiment = useEvalStore((s) => s.isCreatingExperiment);

  useFetchBenchmarks();

  const handleClose = () => {
    form.resetFields();
    onClose();
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const result = await createExperiment({
        benchmarkIds: values.benchmarkIds,
        description: values.description,
        name: values.name,
      });

      message.success(t('experiment.create.title'));
      handleClose();
      onSuccess?.(result.id);
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.message || t('experiment.create.error'));
    }
  };

  return (
    <Modal
      destroyOnHidden
      okButtonProps={{ loading: isCreatingExperiment }}
      okText={t('common.create')}
      open={open}
      title={t('experiment.create.title')}
      onCancel={handleClose}
      onOk={handleCreate}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          label={t('experiment.create.name.label')}
          name="name"
          rules={[{ message: t('experiment.create.nameRequired'), required: true }]}
        >
          <Input placeholder={t('experiment.create.name.placeholder')} />
        </Form.Item>

        <Form.Item label={t('experiment.create.description.label')} name="description">
          <Input.TextArea placeholder={t('experiment.create.description.placeholder')} rows={3} />
        </Form.Item>

        <Form.Item
          label={t('experiment.create.benchmarks.label')}
          name="benchmarkIds"
          rules={[{ message: t('experiment.create.benchmarksRequired'), required: true }]}
        >
          <Select
            mode="multiple"
            placeholder={t('experiment.create.benchmarks.placeholder')}
            options={benchmarkList.map((benchmark) => ({
              label: benchmark.name,
              value: benchmark.id,
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
});

export default ExperimentCreateModal;
