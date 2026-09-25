import type { MouseEvent } from 'react';
import Tables from '../components/Tables';
// import img from '../assets/images/img.png';
import img from '../GuestHomeComponents/assets/convoyai-logo.png';
import { useModal } from '@contexts/ModalContext';
import AddLocation from '../components/AddLocation';
import IntegrationContent from '../components/IntegrationContent';

interface IntegrationRow {
  id: number;
  heading: string;
  description: string;
  icon: string;
}

function Integration() {
  const { openModal } = useModal();

  const columns = [
    { field: 'icon', label: 'Icon' },
    { field: 'heading', label: 'Heading' },
  ];

  const data: IntegrationRow[] = [
    {
      id: 1,
      heading: 'LoRaWAN',
      description: 'Choose from 16 LoRaWAN networks',
      icon: img,
    },
    {
      id: 2,
      heading: 'Particle',
      description: 'Connect your Particle devices',
      icon: img,
    },
    {
      id: 3,
      heading: 'Particle',
      description: 'Connect your Particle devices',
      icon: img,
    },
    {
      id: 4,
      heading: 'Particle',
      description: 'Connect your Particle devices',
      icon: img,
    },
    {
      id: 5,
      heading: 'Particle',
      description: 'Connect your Particle devices',
      icon: img,
    },
    {
      id: 6,
      heading: 'Particle',
      description: 'Connect your Particle devices',
      icon: img,
    },
    {
      id: 7,
      heading: 'Particle',
      description: 'Connect your Particle devices',
      icon: img,
    },
    {
      id: 8,
      heading: 'Particle',
      description: 'Connect your Particle devices',
      icon: img,
    },
    {
      id: 9,
      heading: 'Particle',
      description: 'Connect your Particle devices',
      icon: img,
    },
    {
      id: 10,
      heading: 'Particle',
      description: 'Connect your Particle devices',
      icon: img,
    },
    {
      id: 11,
      heading: 'Particle',
      description: 'Connect your Particle devices',
      icon: img,
    },
    {
      id: 12,
      heading: 'Particle',
      description: 'Connect your Particle devices',
      icon: img,
    },
    {
      id: 13,
      heading: 'Particle',
      description: 'Connect your Particle devices',
      icon: img,
    },
    {
      id: 14,
      heading: 'Particle',
      description: 'Connect your Particle devices',
      icon: img,
    },
  ];

  const handleMenuClick = (e: MouseEvent<HTMLImageElement>, item: IntegrationRow) => {
    e.stopPropagation();
    openModal(<IntegrationContent data={item} />);
  };
  return (
    <div className="m-8">
      <Tables
        data={data}
        className={``}
        columnClass=" w-0 cursor-pointer"
        columns={columns}
        itemsPerPage={14}
        renderCell={(value, column, row) =>
          column.field === 'icon' ? (
            <img
              onClick={e => handleMenuClick(e, row)}
              src={value}
              alt="icon"
              width={40}
              height={40}
            />
          ) : (
            value
          )
        }
      />
    </div>
  );
}

export default Integration;
