import { ModalFuncProps } from 'antd/es/modal/Modal';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import EditableTagList from 'components/TagList';
import { patchTrials } from 'services/api';
import { V1TrialTag } from 'services/api-ts-sdk';
import useModal, { ModalHooks as Hooks } from 'shared/hooks/useModal/useModal';

import css from './useModalTrialTag.module.scss';
interface Props {
  onClose?: () => void;
  trialIds?: number[];
}

export interface ShowModalProps {
  trialIds?: number[];
  initialModalProps?: ModalFuncProps;
}

interface ModalHooks extends Omit<Hooks, 'modalOpen'> {
  modalOpen: (props: ShowModalProps) => void;
}

const useModalTrialTag = ({ onClose, trialIds }: Props): ModalHooks => {
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
  }, [ trialIds, tags ]);

  const handleOk = useCallback(async () => {
    const trialTags: V1TrialTag[] = tags.map((tag) => { return { key: tag, value: tag }; });
    patchTrials(
      {
        patch: { tags: trialTags },
        trialIds: trialIds,
      },
    ).then((response) => console.log(response))
      .catch((err) => console.log(err));
  }, [ tags ]);

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
