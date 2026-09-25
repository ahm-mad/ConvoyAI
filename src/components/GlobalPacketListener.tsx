// GlobalPacketListener
import { useEffect } from 'react';
import { useSocket } from '@contexts/SocketContext';
import { useNavigate } from '@lib/router-compat';
import { showPersistentPacketToast } from '@utils/packetToastManager';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useUser } from '@contexts/UserContext';

export default function GlobalPacketListener() {
  const { isLoggedIn, user } = useUser();
  // if (!localStorage.getItem('token')) return null;
  if (!isLoggedIn) return null;
  // const user = JSON.parse(localStorage.getItem('user'));

  const { bindAllInitialPacketEvents } = useSocket();
  const navigate = useNavigate();

  const {
    data: products,
    isLoading,
    // refetch,
  } = useSimpleQuery('products', `/api/products`, { user_id: user?.id });

  useEffect(() => {
    const productList = products?.data?.data;
    if (productList?.length > 0) {
      bindAllInitialPacketEvents(productList, data => {
        // packet:initial (api_contract §4.2/§4.3) is now just { productId } — Laravel/Pusher's
        // message.product_name is gone, so look the name up from the products list we already have.
        console.log('event socket callback', data);
        const product = productList.find((p: any) => String(p.id) === String(data.productId));
        showPersistentPacketToast({
          productId: data.productId,
          productName: product?.name ?? product?.product_name ?? '',
          navigate,
        });
      });
    }
  }, [products?.data?.data?.length]);

  return null;
}
