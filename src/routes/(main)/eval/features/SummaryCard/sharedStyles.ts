import { createStaticStyles } from 'antd-style';

export const summaryCardStyles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    height: 100%;
    padding: 20px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
  `,
  description: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;

    margin: 0;

    font-size: 12px;
    line-height: 1.6;
    color: ${cssVar.colorTextTertiary};
  `,
  detailLink: css`
    display: flex;
    align-items: center;
    justify-content: center;

    width: 28px;
    height: 28px;
    border-radius: 6px;

    color: ${cssVar.colorTextTertiary};

    transition: all 200ms ${cssVar.motionEaseOut};

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }
  `,
  emptyBox: css`
    padding-block: 24px;
    padding-inline: 16px;
    border: 1px dashed ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    text-align: center;

    background: ${cssVar.colorFillQuaternary};
  `,
  iconBox: css`
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    width: 36px;
    height: 36px;
    border-radius: 8px;
  `,
  meta: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  name: css`
    font-size: 14px;
    font-weight: 500;
    color: ${cssVar.colorText};
    text-decoration: none;

    transition: color 200ms ${cssVar.motionEaseOut};

    &:hover {
      color: ${cssVar.colorPrimary};
    }
  `,
  recentLabel: css`
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextTertiary};
  `,
  viewAll: css`
    font-size: 11px;
    color: ${cssVar.colorPrimary};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  `,
}));
