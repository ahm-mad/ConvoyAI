import Dialog from '@components/ui/Dialog';
import { useModal } from '@contexts/ModalContext';

/** Global modal host: renders whatever `openModal(...)` was given inside the token-styled Dialog. */
const Modal = () => {
  const { modal, closeModal } = useModal();

  return (
    <Dialog open={modal.isOpen} onClose={closeModal} preventClose={Boolean(modal.preventClose)}>
      {modal.content}
    </Dialog>
  );
};

export default Modal;
