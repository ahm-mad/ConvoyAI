import { Dialog, DialogContent } from '@mui/material';
import { useModal } from '@contexts/ModalContext';

const Modal = () => {
  const { modal, closeModal } = useModal();

  if (!modal.isOpen) return null;

  const handleClose = (_event: object, reason: string) => {
    if (modal.preventClose && (reason === 'backdropClick' || reason === 'escapeKeyDown')) {
      return;
    }
    closeModal();
  };

  return (
    <Dialog
      open={modal.isOpen}
      onClose={handleClose}
      scroll="body"
      disableEscapeKeyDown={modal.preventClose}
      BackdropProps={{
        sx: {
          backdropFilter: 'var(--backdrop-blur)',
          backgroundColor: 'var(--backdrop-overlay)',
        },
      }}
      sx={{
        '& .MuiDialog-paper': {
          width: 'auto',
          height: 'auto',
          maxWidth: 'fit-content',
          maxHeight: 'fit-content',
          overflow: 'visible',
          backgroundColor: 'var(--glass-bg-modal)',
          color: 'var(--color-ink-0)',
          border: '1px solid #fff',
          borderRadius: 'var(--radius-modal)',
          boxShadow: 'var(--shadow-modal)',
          backgroundImage: 'var(--gradient-modal-glow)',
        },
      }}
    >
      <DialogContent>{modal.content}</DialogContent>
    </Dialog>
  );
};

export default Modal;
