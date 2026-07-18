'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo } from 'react';

const styles = createStaticStyles(({ css, cssVar }) => ({
  label: css`
    font-size: 13px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};
    text-transform: uppercase;
  `,
  statCard: css`
    flex: 1;

    min-width: 0;
    padding: 16px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 8px;
  `,
  statIcon: css`
    display: flex;
    align-items: center;
    justify-content: center;

    width: 36px;
    height: 36px;
    border-radius: 8px;
  `,
}));

interface EvalStatCardProps {
  children: ReactNode;
  extra?: ReactNode;
  icon: LucideIcon;
  iconBackground: string;
  iconColor: string;
  label: ReactNode;
  uppercaseLabel?: boolean;
}

export const EvalStatCard = memo<EvalStatCardProps>(
  ({ children, extra, icon, iconBackground, iconColor, label, uppercaseLabel = true }) => (
    <div className={styles.statCard}>
      <Flexbox gap={12}>
        <Flexbox horizontal align="center" gap={8}>
          <div className={styles.statIcon} style={{ background: iconBackground }}>
            <Icon icon={icon} size={16} style={{ color: iconColor }} />
          </div>
          <span
            className={styles.label}
            style={uppercaseLabel ? undefined : { textTransform: 'none' }}
          >
            {label}
          </span>
          {extra}
        </Flexbox>
        {children}
      </Flexbox>
    </div>
  ),
);
