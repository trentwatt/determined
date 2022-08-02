import { Select,} from 'antd';
import { ModalFuncProps } from 'antd/es/modal/Modal';
import React, { useCallback, useEffect, useMemo} from 'react';
import useModal, { ModalHooks as Hooks } from 'shared/hooks/useModal/useModal';
import EditableTagList from 'components/TagList';
import css from './useModalTrialTag.module.scss';

const { Option } = Select;

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

  const handleClose = useCallback(() => onClose?.(), [ onClose ]);

  const { modalOpen: openOrUpdate, modalRef, ...modalHook } = useModal({ onClose: handleClose });

  const modalContent = useMemo(() => {
    return (
      <div className={css.base}>
        <EditableTagList
          ghost={false}
          tags={ []}
          onChange={() => {}}
        />
      </div>
    );
  }, [ trialIds ]);

  const handleOk = useCallback(async () => {

    return;
  }, []);

  const getModalProps = useCallback((trialIds): ModalFuncProps => {
    return {
      closable: true,
      content: modalContent,
      icon: null,
      okText: `Add Tags`,
      onOk: handleOk,
      title: `Add Tags to ${trialIds.length} Trials`,
    };
  }, [ handleOk, modalContent ]);

  const modalOpen = useCallback(
    ({
      initialModalProps,
      trialIds,
    }: ShowModalProps = {}) => {
      openOrUpdate({
        ...getModalProps(trialIds),
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
    if (modalRef.current) openOrUpdate(getModalProps(trialIds));
  }, [ getModalProps, modalRef, openOrUpdate, trialIds]);

  return { modalOpen, modalRef, ...modalHook };
};

export default useModalTrialTag;
