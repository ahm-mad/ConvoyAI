import LockIcon from '../assets/icons/MUIicons/LockIcon';
import LockOpenIcon from '../assets/icons/MUIicons/LockOpenIcon';
import { useParams, useLocation, useNavigate } from '@lib/router-compat';
import { del } from '../utils/apiHelper';
import ConfirmDelete from './ConfirmDelete';
import { useModal } from '@contexts/ModalContext';
import { Trash2 } from 'lucide-react';

interface DashboardSubNavProps {
  refetch: () => void;
}

const DashboardSubNav = ({ refetch }: DashboardSubNavProps) => {
  const { openModal, closeModal } = useModal();
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);

  const handleDeleteDashboard = async () => {
    const response = await del(`/api/dashboards/${id}`);
    console.log('Dashboard deleted successfully', response);

    if (response?.success) {
      closeModal();
      refetch();
      navigate('/home');
    }
  };

  function handleLockClick() {
    const currentLock = searchParams.get('lock');

    if (currentLock === 'true') {
      searchParams.set('lock', 'false');
    } else {
      searchParams.set('lock', 'true');
    }

    navigate(`${location.pathname}?${searchParams.toString()}`);
  }

  return (
    <>
      <div className="flex items-center justify-end border-b-[1px] border-background h-12 px-4">
        <div
          onClick={handleLockClick}
          className="w-12 pt-1 h-9 cursor-pointer border border-transparent bg-surface-2 text-ink-2 hover:bg-surface-3 rounded-md mr- flex justify-center item-center transition-colors"
        >
          {searchParams.get('lock') == 'true' ? (
            <LockIcon size="medium" />
          ) : (
            <LockOpenIcon size="medium" />
          )}
        </div>
        {/* <div className="w-12 pt-1 h-9 cursor-pointer border border-transparent bg-[#EBEBEB] text-[#858585] rounded-md flex justify-center item-center">
          <ShareIcon size="medium" />
        </div> */}
        <div
          onClick={() =>
            openModal(
              <ConfirmDelete
                itemName="Dashboard"
                onCancel={closeModal}
                onConfirm={handleDeleteDashboard}
              />
            )
          }
          className="w-12 pt-0 h-9  cursor-pointer border border-transparent bg-surface-2 text-ink-2 rounded-md ml-4 flex justify-center item-center hover:bg-danger/10 hover:text-danger transition-colors"
        >
          <Trash2 size={24} className="mt-1 transition-colors" />
        </div>
      </div>

      {/* <ConfirmationModal
        open={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        // onConfirm={handleDeleteDashboard}
        title="Delete Dashboard"
        message={
          <div>
            <p className="text-base text-gray-800">
              Are you sure you want to delete this?
            </p>
            <p className="text-sm text-red-500 font-semibold">
              This action cannot be undone.
            </p>
          </div>
        }
        confirmButtonText="Delete"
        severity="error"
      /> */}
    </>
  );
};

export default DashboardSubNav;
