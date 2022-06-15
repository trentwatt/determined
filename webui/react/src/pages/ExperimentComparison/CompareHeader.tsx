import { Space } from 'antd';
import React from 'react';

import InlineEditor from 'components/InlineEditor';
import PageHeaderFoldable from 'components/PageHeaderFoldable';

import css from './CompareHeader.module.scss';

const ComparisonHeader: React.FC = () => {
  return (
    <>
      <PageHeaderFoldable
        foldableContent={(
          <div className={css.foldableSection}>
            <div className={css.foldableItem}>
              <span className={css.foldableItemLabel}>Description:</span>
              <InlineEditor
                allowNewline
                disabled={true}
                isOnDark
                maxLength={500}
                placeholder="Add description"
                value="Experiment Comparison"
              />
            </div>
            <div className={css.foldableItem}>
              <span className={css.foldableItemLabel}>Start Time:</span>
              PlaceHolder Thing Other
            </div>
            <div className={css.foldableItem}>
              <span className={css.foldableItemLabel}>Duration:</span>
              More Interesting Placholder
            </div>

          </div>
        )}
        leftContent={(
          <Space align="center" className={css.base}>

            <div className={css.id}>Experiments</div>
            <div className={css.name}>
              <InlineEditor
                disabled={true}
                isOnDark
                maxLength={128}
                placeholder="experiment name"
                value="Is this a name?"
              />
            </div>

          </Space>
        )}
      />
      {/* <ExperimentHeaderProgress experiment={experiment} /> */}
    </>
  );
};

export default ComparisonHeader;
