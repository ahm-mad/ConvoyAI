import { Network, Box, BrainCircuit, LayoutGrid } from 'lucide-react';
export const architectureLayers = [
  {
    index: '01',
    name: 'Connectivity Layer',
    description:
      'Protocol-agnostic ingestion engine handling LoRaWAN, BACnet, Modbus, MQTT, and industrial SCADA with under-50ms telemetry latency.',
    icon: Network,
    accent: 'blue',
  },
  {
    index: '02',
    name: 'Digital Twin Engine',
    description:
      'Semantic asset mapping, 3D BIM/GIS integration, real-time spatial relationship graph, and high-fidelity environmental simulations.',
    icon: Box,
    accent: 'blue',
  },
  {
    index: '03',
    name: 'AI Intelligence',
    description:
      'Autonomous orchestrators, predictive maintenance modeling, energy load forecast optimization, and natural language Copilots responding in real-time.',
    icon: BrainCircuit,
    accent: 'blue',
  },
  {
    index: '04',
    name: 'Enterprise Apps',
    description:
      'Unified visual command centers, smart city dashboards, facility management portfolios, ESG reporting tools, and real-time alert hubs.',
    icon: LayoutGrid,
    accent: 'green',
  },
];
