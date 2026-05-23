'use client';

import { Accordion, Flexbox } from '@lobehub/ui';
import { LayoutDashboardIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import NavItem from '@/features/NavPanel/components/NavItem';
import { usePathname } from '@/libs/router/navigation';
import { useEvalStore } from '@/store/eval';

import BenchmarkList from './BenchmarkList';
import ExperimentList from './ExperimentList';

const useActiveKey = () => {
  const pathname = usePathname();
  if (pathname === '/eval') return 'dashboard';
  if (pathname === '/eval/experiments') return 'experiments';

  const experimentMatch = pathname.match(/\/eval\/experiments\/([^/]+)/);
  if (experimentMatch) return `experiment-${experimentMatch[1]}`;

  const match = pathname.match(/\/eval\/bench\/([^/]+)/);
  if (match) return `bench-${match[1]}`;

  return 'dashboard';
};

const Body = memo(() => {
  const activeKey = useActiveKey();
  const navigate = useNavigate();
  const { t } = useTranslation('eval');
  const useFetchBenchmarks = useEvalStore((s) => s.useFetchBenchmarks);
  const useFetchExperiments = useEvalStore((s) => s.useFetchExperiments);
  useFetchBenchmarks();
  useFetchExperiments();

  return (
    <Flexbox gap={8} paddingInline={4}>
      <Flexbox gap={1}>
        <Link
          to="/eval"
          onClick={(e) => {
            e.preventDefault();
            navigate('/eval');
          }}
        >
          <NavItem
            active={activeKey === 'dashboard'}
            icon={LayoutDashboardIcon}
            title={t('sidebar.dashboard')}
          />
        </Link>
        <Link
          to="/eval/experiments"
          onClick={(e) => {
            e.preventDefault();
            navigate('/eval/experiments');
          }}
        >
          <NavItem
            active={activeKey === 'experiments'}
            icon={LayoutDashboardIcon}
            title={t('sidebar.experiments')}
          />
        </Link>
      </Flexbox>
      <Accordion defaultExpandedKeys={['benchmarks']} gap={8}>
        <ExperimentList activeKey={activeKey} itemKey="experiments" />
        <BenchmarkList activeKey={activeKey} itemKey="benchmarks" />
      </Accordion>
    </Flexbox>
  );
});

export default Body;
