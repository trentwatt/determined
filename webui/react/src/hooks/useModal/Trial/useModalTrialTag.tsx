import { ModalFuncProps } from 'antd/es/modal/Modal';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import EditableTagList from 'components/TagList';
import { TrialFilters } from 'pages/TrialsComparison/types';
import { patchTrials, patchBulkTrials } from 'services/api';
import { V1TrialFilters, V1TrialTag } from 'services/api-ts-sdk';
import useModal, { ModalHooks as Hooks } from 'shared/hooks/useModal/useModal';

import css from './useModalTrialTag.module.scss';

interface Props {
  onClose?: () => void;
  trialIds?: number[];
  selectAllMatching: boolean;
  filters: TrialFilters
}

export interface ShowModalProps {
  trialIds?: number[];
  initialModalProps?: ModalFuncProps;
}

interface ModalHooks extends Omit<Hooks, 'modalOpen'> {
  modalOpen: (props: ShowModalProps) => void;
}

const useModalTrialTag = ({ onClose, trialIds, selectAllMatching, filters }: Props): ModalHooks => {
  const [ tags, setTags ] = useState<string[]> ([]);
  const handleClose = useCallback(() => onClose?.(), [ onClose ]);

  const { modalOpen: openOrUpdate, modalRef, ...modalHook } = useModal({ onClose: handleClose });

  const modalContent = useMemo(() => {
    return (
      <div className={css.base}>
        Tags
        <EditableTagList
          ghost={false}
          tags={tags}
          onChange={(newTags) => {
            setTags(newTags);
          }}
        />
      </div>
    );
  }, [ tags ]);

  const handleOk = useCallback(async () => {
    const trialTags: V1TrialTag[] = tags.map((tag) => { return { key: tag, value: tag }; });
    if(selectAllMatching){
      const requestTrialFilters = filters as V1TrialFilters
      patchBulkTrials(
        {
          patch: { tags: trialTags },
          filters: requestTrialFilters,
        },
      ).then((response) => console.log("select all response", response))
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
  }, [ tags, trialIds ]);

  const getModalProps = useCallback((trialIds: number[]): ModalFuncProps => {
    return {
      closable: true,
      content: modalContent,
      icon: null,
      okText: 'Add Tags',
      onOk: handleOk,
      title: trialIds.length > 1 ? `Add Tags to ${trialIds.length} Trials` : `Add Tags to Trial ID: ${trialIds[0]}`,
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

export default useModalTrialTag;
