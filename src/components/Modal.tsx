import { Dialog, DialogContent } from '@mui/material';
import { useModal } from '@contexts/ModalContext';

const Modal = () => {
  const { modal, closeModal } = useModal();

  if (!modal.isOpen) return null;

  const handleClose = (_event: object, reason: string) => {
    console.log('aa', reason);
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
          backdropFilter: 'blur(8px)', //
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
        },
      }}
      sx={{
        '& .MuiDialog-paper': {
          width: 'auto',
          height: 'auto',
          maxWidth: 'fit-content',
          maxHeight: 'fit-content',
          overflow: 'visible',
          backgroundColor: 'var(--color-surface-1)',
          color: 'var(--color-ink-0)',
          border: '1px solid var(--color-line)',
          borderRadius: '14px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          backgroundImage: 'none',
        },
      }}
    >
      <DialogContent>{modal.content}</DialogContent>
    </Dialog>
  );
};

export default Modal;
