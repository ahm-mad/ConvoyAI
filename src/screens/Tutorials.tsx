// import React, { useState, useMemo, useEffect, useRef } from 'react';
// import { useTranslation } from 'react-i18next';
// import { useModal } from '@contexts/ModalContext';
// import addProductVideo from '@assets/convoyaiAddProduct.mp4';
// import addProductPoster from '../assets/convoyai_poster_hd.jpg';
// import addWidgetVideo from '../assets/demo-add-widgets.mp4';
// import addWidgetPoster from '../assets/convoyai_widget_poster.jpg';
// import addAssetsVideo from '../assets/optimized-digital-twin.mp4'; // Update with your actual file path
// import addAssetsPoster from '../assets/assets-thumbnail.jpg';
// import addSimulationVideo from '../assets/optimized-simulation-fixed.mp4'; // Update with your actual file path
// import addSimulationPoster from '../assets/thumbnail.jpg'; // Update with your actual file path
// import {
//   LayoutGrid,
//   Box,
//   Building2,
//   Search,
//   Play,
//   Clock,
//   X,
//   ChevronRight,
//   Sparkles,
//   BookOpen,
//   CheckCircle2,
//   PlayCircle,
// } from 'lucide-react';

// // ---- Tutorial data ---------------------------------------------------
// const CATEGORIES = [
//   { id: 'all', label: 'All Tutorials', icon: BookOpen },
//   { id: 'product', label: 'Add Product', icon: Box },
//   { id: 'widget', label: 'Add Widget', icon: LayoutGrid },
//   { id: 'assets', label: 'Add Assets', icon: Building2 },
//   { id: 'simulation', label: 'Simulation', icon: PlayCircle },
// ];

// const TUTORIALS = [
//   {
//     id: 1,
//     category: 'product',
//     title: 'Add Product',
//     description: 'Step-by-step guide to registering a new product and configuring its details.',
//     videoUrl: addProductVideo,
//     poster: addProductPoster,
//     steps: [
//       'Go to the Products page from the sidebar',
//       'Click the "+ Add Product" button',
//       'Select the demo product from the list',
//       'Click "Save" to publish the product',
//     ],
//   },
//   {
//     id: 2,
//     category: 'widget',
//     title: 'Add Widget',
//     description: 'Learn how to add and configure widgets on your dashboard.',
//     videoUrl: addWidgetVideo,
//     poster: addWidgetPoster,
//     steps: [
//       'Click "Add New" to create a new dashboard',
//       'Browse the list of available widgets',
//       'Drag and drop a widget onto the dashboard',
//       'Fill in the required details in the form that opens',
//       'Click "Save" to drop the widget onto the dashboard',
//     ],
//   },
//   {
//     id: 3,
//     category: 'assets',
//     title: 'Add Assets',
//     description: 'Import and organize building assets such as floor plans and models.',
//     videoUrl: addAssetsVideo,
//     poster: addAssetsPoster,
//     steps: [
//       'Click "Assets" from the sidebar',
//       'Click the eye icon on the building',
//       'Wait for the building to load',
//       'View the hologram view of the building',
//     ],
//   },
//   {
//     id: 4,
//     category: 'simulation',
//     title: 'Simulation',
//     description: 'Run and explore simulations to visualize how your building performs.',
//     videoUrl: addSimulationVideo,
//     poster: addSimulationPoster,
//     steps: [
//       'Click your avatar in the navbar',
//       'Select "Simulation" from the popover menu',
//       'Choose to send a single or multiple packets',
//       'Select the product',
//       'Choose "Normal" or "Alert" — if "Signal", selected enter a value',
//       'Click "Save"',
//     ],
//   },
// ];

// const CATEGORY_ICONS = {
//   product: Box,
//   widget: LayoutGrid,
//   assets: Building2,
//   simulation: PlayCircle,
// };

// // A direct video file (mp4/webm/mov/ogg) needs a <video> tag.
// // Anything else (YouTube/Vimeo/Loom links etc.) is treated as an embed and goes in an <iframe>.
// const isDirectVideoFile = url => /\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(url || '');

// // Format seconds into "Xh Ym" / "X min" / "0:SS"
// function formatDuration(totalSeconds) {
//   if (!totalSeconds || !isFinite(totalSeconds)) return null;
//   const seconds = Math.round(totalSeconds);
//   const hrs = Math.floor(seconds / 3600);
//   const mins = Math.floor((seconds % 3600) / 60);
//   const secs = seconds % 60;

//   if (hrs > 0) return `${hrs}h ${mins}m`;
//   if (mins > 0) return `${mins} min`;
//   return `${secs}s`;
// }

// // Hook: reads the real duration of a direct video file by loading its metadata
// function useVideoDuration(videoUrl) {
//   const [duration, setDuration] = useState(null);

//   useEffect(() => {
//     if (!videoUrl || !isDirectVideoFile(videoUrl)) {
//       setDuration(null);
//       return;
//     }
//     const videoEl = document.createElement('video');
//     videoEl.preload = 'metadata';
//     videoEl.src = videoUrl;

//     const handleLoaded = () => {
//       setDuration(videoEl.duration);
//       cleanup();
//     };
//     const cleanup = () => {
//       videoEl.removeEventListener('loadedmetadata', handleLoaded);
//       videoEl.src = '';
//     };

//     videoEl.addEventListener('loadedmetadata', handleLoaded);
//     return cleanup;
//   }, [videoUrl]);

//   return duration;
// }

// // ---- Tutorial Card -----------------------------------------------------
// function TutorialCard({ tutorial, onPlay }) {
//   const Icon = CATEGORY_ICONS[tutorial.category] || BookOpen;
//   const rawDuration = useVideoDuration(tutorial.videoUrl);
//   const durationLabel = formatDuration(rawDuration);

//   return (
//     <div
//       className="group relative glass-strong  overflow-hidden hover:border-line transition-all duration-300 cursor-pointer"
//       onClick={() => onPlay(tutorial)}
//     >
//       {/* Thumbnail */}
//       <div className="relative h-36 bg-surface-2 border-b border-line-soft flex items-center justify-center overflow-hidden">
//         {tutorial.poster ? (
//           <img src={tutorial.poster} alt={tutorial.title} className="w-full h-full object-cover" />
//         ) : (
//           <Icon
//             size={34}
//             className="text-ink-2 group-hover:text-ink-1 transition-colors duration-300"
//             strokeWidth={1.5}
//           />
//         )}

//         <div className="absolute inset-0 bg-surface-0/0 group-hover:bg-surface-0/40 transition-colors duration-300 flex items-center justify-center">
//           <div className="w-11 h-11 rounded-full brand-gradient-bg flex items-center justify-center scale-90 group-hover:scale-100 opacity-0 group-hover:opacity-100 transition-all duration-300">
//             <Play size={15} className="on-gradient ml-0.5" fill="currentColor" />
//           </div>
//         </div>

//         {durationLabel && (
//           <div className="absolute top-3 right-3 flex items-center gap-1 bg-surface-1 px-2 py-1 rounded text-[11px] font-medium text-ink-2 ring-1 ring-line-soft">
//             <Clock size={11} />
//             {durationLabel}
//           </div>
//         )}
//       </div>

//       {/* Content */}
//       <div className="p-4">
//         <h3 className="text-sm font-semibold text-ink-0 mb-1">{tutorial.title}</h3>
//         <p className="text-xs text-ink-2 leading-relaxed line-clamp-2">{tutorial.description}</p>

//         <div className="mt-3.5 pt-3 border-t border-line-soft flex items-center justify-between">
//           <span className="text-xs text-ink-2 capitalize">{tutorial.category}</span>
//           <div className="flex items-center text-xs font-medium text-ink-1 group-hover:text-brand-text transition-colors duration-200">
//             Watch
//             <ChevronRight
//               size={13}
//               className="ml-0.5 group-hover:translate-x-0.5 transition-transform duration-200"
//             />
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }

// // ---- Tutorial Modal (rendered via ModalContext) ---------------------
// function TutorialModal({ tutorial, onClose }) {
//   if (!tutorial) return null;
//   const Icon = CATEGORY_ICONS[tutorial.category] || BookOpen;
//   const hasVideo = Boolean(tutorial.videoUrl);
//   const directVideo = isDirectVideoFile(tutorial.videoUrl);
//   const rawDuration = useVideoDuration(tutorial.videoUrl);
//   const durationLabel = formatDuration(rawDuration);

//   return (
//     <div className="w-full max-w-lg lg:max-w-xl max-h-[85vh] overflow-y-auto">
//       <div className="flex items-center justify-between px-1 py-1 pb-3 border-b border-line-soft">
//         <div className="flex items-center gap-3">
//           <div className="w-9 h-9 rounded-md bg-surface-2 ring-1 ring-line-soft flex items-center justify-center flex-shrink-0">
//             <Icon size={16} className="text-ink-1" strokeWidth={1.75} />
//           </div>
//           <div>
//             <h3 className="text-sm font-semibold text-ink-0">{tutorial.title}</h3>
//             {durationLabel && (
//               <span className="text-xs text-ink-2 flex items-center gap-1 mt-0.5">
//                 <Clock size={11} />
//                 {durationLabel}
//               </span>
//             )}
//           </div>
//         </div>
//         <button
//           onClick={onClose}
//           className="p-1.5 hover:bg-surface-3 cursor-pointer rounded-md transition-colors duration-200"
//           aria-label="Close"
//         >
//           <X size={17} className="text-ink-2" />
//         </button>
//       </div>

//       <div className="aspect-video bg-surface-0 border border-line-soft rounded-md mt-3 flex items-center justify-center overflow-hidden relative">
//         {hasVideo && directVideo ? (
//           <video
//             key={tutorial.videoUrl}
//             src={tutorial.videoUrl}
//             poster={tutorial.poster}
//             controls
//             preload="metadata"
//             className="w-full h-full rounded-lg bg-black object-contain"
//           >
//             Your browser does not support the video tag.
//           </video>
//         ) : hasVideo ? (
//           <iframe
//             src={tutorial.videoUrl}
//             title={tutorial.title}
//             className="w-full h-full rounded-lg"
//             allow="autoplay; fullscreen"
//           />
//         ) : (
//           <div className="text-ink-2 text-sm flex flex-col items-center gap-2.5">
//             <div className="w-12 cursor-pointer h-12 rounded-full bg-white/5 flex items-center justify-center">
//               <Play size={20} />
//             </div>
//             Video coming soon
//           </div>
//         )}
//       </div>

//       <p className="text-sm text-ink-1 mt-3 leading-relaxed">{tutorial.description}</p>

//       {tutorial.steps && tutorial.steps.length > 0 && (
//         <div className="mt-4 border border-line-soft rounded-md p-3.5">
//           <h4 className="text-xs font-semibold text-ink-1 uppercase tracking-wide mb-2.5">
//             Steps
//           </h4>
//           <ol className="space-y-2.5">
//             {tutorial.steps.map((step, index) => (
//               <li key={index} className="flex items-start gap-3 text-sm text-ink-1">
//                 <span className="flex-shrink-0 w-5 h-5 rounded-full text-[11px] font-semibold flex items-center justify-center mt-0.5 bg-accent-cyan/10 text-brand-text ring-1 ring-accent-cyan/25">
//                   {index + 1}
//                 </span>
//                 <span className="pt-0.5">{step}</span>
//               </li>
//             ))}
//           </ol>
//         </div>
//       )}

//       <div className="mt-4 flex justify-end gap-2 pb-1">
//         <button
//           onClick={onClose}
//           className="px-4 py-2 text-sm border cursor-pointer bg-surface-2 border-line font-medium text-ink-1 hover:bg-surface-3 rounded-md transition-colors duration-200"
//         >
//           Close
//         </button>
//       </div>
//     </div>
//   );
// }

// // ---- Main Page ---------------------------------------------------
// export default function Tutorials() {
//   const { t } = useTranslation();
//   const { openModal, closeModal } = useModal();
//   const [activeCategory, setActiveCategory] = useState('all');
//   const [query, setQuery] = useState('');

//   const filtered = useMemo(() => {
//     return TUTORIALS.filter(item => {
//       const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
//       const matchesQuery = item.title.toLowerCase().includes(query.toLowerCase());
//       return matchesCategory && matchesQuery;
//     });
//   }, [activeCategory, query]);

//   const completedCount = 0; // wire up to real progress data when available
//   const progressPct = Math.round((completedCount / TUTORIALS.length) * 100);

//   const categoryCounts = useMemo(() => {
//     const counts = { all: TUTORIALS.length };
//     TUTORIALS.forEach(t => {
//       counts[t.category] = (counts[t.category] || 0) + 1;
//     });
//     return counts;
//   }, []);

//   const handleOpenTutorial = tutorial => {
//     openModal(<TutorialModal tutorial={tutorial} onClose={closeModal} />);
//   };

//   return (
//     <div className="min-h-full">
//       {/* Header */}
//       <div className="bg-surface-1 border-b border-line-soft px-6 sm:px-8">
//         <div className="flex p-2 flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
//           <div>
//             <h1 className="text-base font-semibold text-ink-0 tracking-tight font-display">
//               Tutorials & Guides
//             </h1>
//             <p className="text-xs text-ink-2 mt-1.5 max-w-md">
//               Learn how to add products, widgets, assets, and run simulations.
//             </p>
//           </div>

//           {/* Search */}
//           <div className="relative w-full lg:w-60">
//             <Search
//               size={16}
//               className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-2"
//             />
//             <input
//               type="text"
//               value={query}
//               onChange={e => setQuery(e.target.value)}
//               placeholder="Search tutorials..."
//               className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-surface-2 text-ink-0 border border-line rounded-md focus:outline-none focus:border-accent-cyan focus:ring-2 focus:ring-accent-cyan/15 transition-all duration-200"
//             />
//           </div>
//         </div>
//       </div>

//       <div className="px-6 sm:px-8 py-7">
//         <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-7">
//           {/* Category tabs */}
//           <div className="flex flex-wrap gap-1.5">
//             {CATEGORIES.map(cat => {
//               const Icon = cat.icon;
//               const isActive = activeCategory === cat.id;
//               return (
//                 <button
//                   key={cat.id}
//                   onClick={() => setActiveCategory(cat.id)}
//                   className={`flex items-center cursor-pointer gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border transition-all duration-200 ${
//                     isActive
//                       ? 'brand-gradient-bg on-gradient border-transparent'
//                       : 'bg-surface-2 border-line-soft text-ink-1 hover:border-line hover:text-ink-0'
//                   }`}
//                 >
//                   <Icon size={15} strokeWidth={1.75} />
//                   {cat.label}
//                   {categoryCounts[cat.id] && (
//                     <span
//                       className={`ml-1 text-xs ${
//                         isActive ? 'opacity-80' : 'text-ink-2'
//                       }`}
//                     >
//                       ({categoryCounts[cat.id]})
//                     </span>
//                   )}
//                 </button>
//               );
//             })}
//           </div>
//         </div>

//         {/* Grid */}
//         {filtered.length > 0 ? (
//           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
//             {filtered.map(tutorial => (
//               <TutorialCard key={tutorial.id} tutorial={tutorial} onPlay={handleOpenTutorial} />
//             ))}
//           </div>
//         ) : (
//           <div className="flex flex-col items-center justify-center py-20 text-ink-2 bg-surface-1 border border-dashed border-line-soft rounded-md">
//             <div className="w-12 h-12 rounded-full bg-surface-2 ring-1 ring-line-soft flex items-center justify-center mb-3">
//               <BookOpen size={20} strokeWidth={1.5} />
//             </div>
//             <p className="text-sm font-medium text-ink-1">
//               No tutorials found for &ldquo;{query}&rdquo;
//             </p>
//             <p className="text-xs text-ink-2 mt-1">Try a different search term or category.</p>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }
