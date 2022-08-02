import { Button, Select } from 'antd';
import React, { PropsWithChildren, useCallback, useState } from 'react';

import css from './TableBatch.module.scss';

export enum SelectionMode {
  SELECT_MATCHING= 'SELECT_MATCHING',
  SELECT_INDIVIDUAL= 'SELECT_INDIVIDUAL'
}
interface Action {
  disabled?: boolean;
  label: string;
  value: string;
}

interface Props {
  actions?: Action[];
  ids?: string[];
  onAction?: (action: string) => void;
  onClear?: () => void;
  onSelectIndividual? : () => void
  onSelectMatching? : () => void;
  selectedRowCount?: number;
  selectionMode?: SelectionMode
}

const defaultProps = {
  ids: [],
  selectedRowCount: 0,
};

const TableBatch: React.FC<Props> = ({
  actions,
  selectedRowCount,
  selectionMode,
  onAction,
  onClear,
  onSelectMatching,
  onSelectIndividual,
}: PropsWithChildren<Props>) => {
  const [ action, setAction ] = useState<string>();
  const classes = [ css.base ];
  const selectCount = selectedRowCount || 0;

  const message = `Apply batch operations to ${selectCount}` +
    ` item${selectCount === 1 ? '' : 's'}`;

  if (selectCount > 0) classes.push(css.show);

  const handleAction = useCallback((action?: string) => {
    /*
     * This succession setting of action to an empty string
     * followed by `undefined` is required to guarantee clearing
     * out of the selection value. Using a state `value` prop and
     * setting the state to `undefined` did not work.
     */
    setAction('');
    setTimeout(() => setAction(undefined), 100);

    if (action && onAction) onAction(action);
  }, [ onAction ]);

  const handleClear = useCallback(() => {
    if (onClear) onClear();
  }, [ onClear ]);

  return (
    <div className={classes.join(' ')}>
      <div className={css.container}>
        <div className={css.actions}>
          <Select
            options={actions}
            placeholder="Select an action..."
            value={action}
            onSelect={handleAction}
          />
        </div>
        <div className={css.message}>{message}</div>
        {onSelectMatching && selectionMode !== SelectionMode.SELECT_MATCHING && (
          <div className={css.selectMode}>
            <Button onClick={onSelectMatching}>Select All Matching</Button>
          </div>
        )
        }
        {onSelectIndividual && selectionMode === SelectionMode.SELECT_MATCHING && (
          <div className={css.selectMode}>
            <Button onClick={onSelectIndividual}>Individual Selection</Button>
          </div>
        )
        }
        <div className={css.clear}>
          <Button onClick={handleClear}>Clear</Button>
        </div>
      </div>
    </div>
  );
};

TableBatch.defaultProps = defaultProps;

export default TableBatch;
