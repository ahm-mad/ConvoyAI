import buildingImg from '../assets/buildingImg.png';
import boatImg from '../assets/boatImg.png';
import cowImg from '../assets/cowImg.png';
export const useCases = [
  {
    tag: 'OCCUPANCY, ENERGY, Smart Lighting',
    accent: 'cyan',
    title: 'Smart Building',
    description:
      'Track occupancy, energy load, and air quality across every floor from a single command view.',
    stat1Label: 'Energy Savings',
    stat1Value: '18% reduction',
    stat2Label: 'Response Time',
    stat2Value: 'Under 2 min',
    image: buildingImg,
  },
  {
    tag: 'SEA-TO-YARD, CONNECTED',
    accent: 'green',
    title: 'Smart Boats',
    description:
      'Monitor location, fuel, and vessel health across your fleet, even in low-connectivity waters.',
    stat1Label: 'Fuel Efficiency',
    stat1Value: '+22%',
    stat2Label: 'Downtime Prevented',
    stat2Value: '340 hrs/yr',
    image: boatImg,
  },
  {
    tag: 'Cattle, Livestock Health, Monitoring',
    accent: 'amber',
    title: 'Smart Farming',
    description:
      'Monitor cattle health, location, and livestock activity across every acre, in one dashboard.',
    stat1Label: 'Water Saved',
    stat1Value: '1.2M gallons/yr',
    stat2Label: 'Crop Yield',
    stat2Value: '+15%',
    image: cowImg,
  },
];
