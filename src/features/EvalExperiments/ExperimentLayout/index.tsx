'use client';

import { Flexbox } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { type FC } from 'react';
import { Outlet } from 'react-router-dom';

import NavHeader from '@/features/NavHeader';
import { NavPanelPortal } from '@/features/NavPanel';
import SideBarLayout from '@/features/NavPanel/SideBarLayout';

import Body from './Sidebar/Body';
import Header from './Sidebar/Header';

const styles = createStaticStyles(({ css, cssVar }) => ({
  mainContainer: css`
    position: relative;
    overflow: auto;
    background: ${cssVar.colorBgContainer};
  `,
}));

const ExperimentLayout: FC = () => {
  return (
    <>
      <NavPanelPortal navKey="evalExperiment">
        <SideBarLayout body={<Body />} header={<Header />} />
      </NavPanelPortal>
      <Flexbox className={styles.mainContainer} flex={1} height={'100%'}>
        <NavHeader style={{ left: 0, position: 'absolute', top: 0, zIndex: 10 }} />
        <Outlet />
      </Flexbox>
    </>
  );
};

export default ExperimentLayout;
