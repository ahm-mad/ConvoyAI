import {
  Network,
  Box,
  LayoutGrid,
  Cpu,
  Share2,
  Workflow,
  Activity,
  Leaf,
  Smartphone,
  ShieldCheck,
  FileText,
  Code2,
} from 'lucide-react';
export const capabilities = [
  {
    title: 'Protocol Agnostic Ingestion',
    description: 'Connect legacy BACnet, SCADA, Modbus, MQTT, or custom APIs out-of-the-box.',
    icon: Network,
    accent: 'blue',
  },
  {
    title: 'High-Fidelity Digital Twins',
    description: 'Render semantic 3D models with integrated BIM/GIS spatial layers.',
    icon: Box,
    accent: 'cyan',
  },
  {
    title: 'Real-time Dashboards',
    description: 'Visualize millions of live sensor data points with sub-50ms update latency.',
    icon: LayoutGrid,
    accent: 'purple',
  },
  {
    title: 'Device Management',
    description: 'Configure, update, and provision thousands of edge gateways remotely.',
    icon: Cpu,
    accent: 'green',
  },
  {
    title: 'Advanced Rule Engine',
    description: 'Design logical workflows and conditional alerts with visual drag-and-drop tools.',
    icon: Share2,
    accent: 'yellow',
  },
  {
    title: 'Workflow Automation',
    description: 'Instantly trigger system overrides, work tickets, and emergency alerts.',
    icon: Workflow,
    accent: 'yellow',
  },
  {
    title: 'Predictive Maintenance',
    description: 'Leverage Machine Learning to anticipate equipment failures weeks in advance.',
    icon: Activity,
    accent: 'red',
  },
  {
    title: 'Energy Analytics',
    description: 'Track ESG metrics, carbon footprints, and discover optimization opportunities.',
    icon: Leaf,
    accent: 'green',
  },
  {
    title: 'Responsive Mobile Apps',
    description: 'Keep field technicians and facility managers updated on-the-go with native apps.',
    icon: Smartphone,
    accent: 'blue',
  },
  {
    title: 'Role-Based Permissions',
    description: 'Enforce strict data boundaries across divisions with granular tenant controls.',
    icon: ShieldCheck,
    accent: 'purple',
  },
  {
    title: 'Statement Governance',
    description: 'Auditable logs of every automated command, system override, and user action.',
    icon: FileText,
    accent: 'pink',
  },
  {
    title: 'Enterprise REST & gRPC APIs',
    description:
      'Integrate effortlessly with ERP systems like SAP, Salesforce, and custom platforms.',
    icon: Code2,
    accent: 'green',
  },
];
