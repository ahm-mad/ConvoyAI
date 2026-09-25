'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface ModalState {
  isOpen: boolean;
  content: ReactNode;
  preventClose: boolean;
}

interface ModalContextValue {
  modal: ModalState;
  openModal: (content: ReactNode, options?: { preventClose?: boolean }) => void;
  closeModal: () => void;
  setPreventClose: (prevent: boolean) => void;
}

const ModalContext = createContext<ModalContextValue | undefined>(undefined);

export const ModalProvider = ({ children }: { children: ReactNode }) => {
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    content: null,
    preventClose: false,
  });

  const openModal = (content: ReactNode, options: { preventClose?: boolean } = {}) => {
    setModal({
      isOpen: true,
      content,
      preventClose: options.preventClose || false,
    });
  };

  const closeModal = () => {
    setModal({ isOpen: false, content: null, preventClose: false });
  };

  const setPreventClose = (prevent: boolean) => {
    setModal(prev => ({ ...prev, preventClose: prevent }));
  };

  return (
    <ModalContext.Provider value={{ modal, openModal, closeModal, setPreventClose }}>
      {children}
    </ModalContext.Provider>
  );
};

export const useModal = () => useContext(ModalContext) as ModalContextValue;
