import { Input } from 'antd';
import { ModalFuncProps } from 'antd/es/modal/Modal';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { TrialFilters } from 'pages/TrialsComparison/types';
import { createTrialCollection,patchBulkTrials, patchTrials  } from 'services/api';
import { TrialSorterNamespace, V1TrialFilters, V1TrialSorter, V1TrialTag  } from 'services/api-ts-sdk';
import useModal, { ModalHooks as Hooks } from 'shared/hooks/useModal/useModal';

import css from './useModalTrialCollection.module.scss';

interface Props {
  onClose?: () => void;
  trialIds?: number[];
  filters: TrialFilters;
  projectId: number;
  selectAllMatching: boolean;
}

export interface ShowModalProps {
  trialIds?: number[];
  initialModalProps?: ModalFuncProps;
  filters?: TrialFilters
  projectId: number;
  selectAllMatching: boolean;
}

interface ModalHooks extends Omit<Hooks, 'modalOpen'> {
  modalOpen: (props: ShowModalProps) => void;
}

const useModalTrialCollection = ({ onClose, trialIds, filters, projectId, selectAllMatching }: Props): ModalHooks => {
  const inputRef = useRef<Input>(null);
  const [ name, setName ] = useState('');
  const handleClose = useCallback(() => onClose?.(), [ onClose ]);
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
  }, []);
  const { modalOpen: openOrUpdate, modalRef, ...modalHook } = useModal({ onClose: handleClose });

  const modalContent = useMemo(() => {
    return (
      <div className={css.base}>
        <Input
          allowClear
          bordered={true}
          placeholder="collection name"
          ref={inputRef}
          value={name}
          onChange={handleChange}
        />
      </div>
    );
  }, [ name, handleChange ]);

  // clean this up
  const handleOk = useCallback(async () => {
    const requestFilters = filters as V1TrialFilters;
    const sorter: V1TrialSorter = {
      field: '',
      namespace: TrialSorterNamespace.TRIALS,
    };
    try {
      await createTrialCollection({ filters: requestFilters, name, projectId, sorter })
      const trialTags: V1TrialTag[] = [{ key: name, value: name }];
      if (selectAllMatching){
        const requestTrialFilters = filters as V1TrialFilters;
        patchBulkTrials(
          {
            filters: requestTrialFilters,
            patch: { tags: trialTags },
          },
        ).then((response) => console.log(response))
          .catch((err) => console.log(err));
      } else {
        patchTrials(
          {
            patch: { tags: trialTags },
            trialIds: trialIds ?? [],
          },
        ).then((response) => console.log(response))
          .catch((err) => console.log(err));
      }
    } catch (err){
      console.log(err)
    }
  }, [ name, filters, projectId ]);

  const getModalProps = useCallback((trialIds: number[]): ModalFuncProps => {
    return {
      closable: true,
      content: modalContent,
      icon: null,
      okText: 'Create Collection',
      onOk: handleOk,
      title: trialIds.length > 1 ? `Create Collection for ${trialIds.length} Trials` : `Create Collection for Trial ID: ${trialIds[0]}`,
    };
  }, [ handleOk, modalContent ]);

  const modalOpen = useCallback(
    ({
      initialModalProps,
      trialIds,
    }: ShowModalProps) => {
      openOrUpdate({
        ...getModalProps(trialIds || []),
        ...initialModalProps,
      });
    },
    [
      getModalProps,
      openOrUpdate,
    ],
  );

  /**
   * When modal props changes are detected, such as modal content
   * title, and buttons, update the modal.
   */
  useEffect(() => {
    if (modalRef.current) openOrUpdate(getModalProps(trialIds || []));
  }, [ getModalProps, modalRef, openOrUpdate, trialIds ]);

  return { modalOpen, modalRef, ...modalHook };
};

export default useModalTrialCollection;
