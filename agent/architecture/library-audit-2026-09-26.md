# Library overlap audit (T-002, 2026-09-26) — files in src/app importing each

| Job            | Present                                                                                                                         | Files using | Proposal for the new UI                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Component kits | @mui/material (25), @radix-ui/* (13), antd (1), @radix-ui/themes                                                                | overlapping | Drop MUI/antd/Radix Themes; build own components on Tailwind + Radix primitives (headless)                        |
| Icons          | lucide-react (130), @mui/icons-material (54), react-icons (10), @radix-ui/react-icons                                           | 4 sets      | lucide-react only                                                                                                 |
| Charts         | apexcharts + react-apexcharts (6), chart.js + react-chartjs-2 (4)                                                               | 2 engines   | ApexCharts only (rich, animated) — or custom SVG for hero charts                                                  |
| Motion         | framer-motion (0), motion (0)                                                                                                   | unused      | keep one (`motion`) for the new UI                                                                                |
| Dates          | date-fns (0), dayjs (0), @mui/x-date-pickers                                                                                    | unused/MUI  | one small lib (date-fns) + own picker                                                                             |
| Toasts         | react-hot-toast (34)                                                                                                            | ok          | keep or replace with own styled toaster                                                                           |
| Maps           | leaflet + react-leaflet (10)                                                                                                    | ok          | keep Leaflet with a light custom tile style (MapTiler key from env)                                               |
| Forms          | react-hook-form (41) + yup (56)                                                                                                 | ok          | keep                                                                                                              |
| Data           | @tanstack/react-query (43), zustand (0)                                                                                         | ok          | keep react-query; zustand unused                                                                                  |
| Other          | cmdk (1), vaul (0), gridstack (1), driver.js (11), lottie-web (1), react-calendly (3), @calcom/embed-react (1), canvas-confetti | niche       | keep cmdk (Cmd-K); drop unused (vaul, zustand, dayjs, date-fns if unused); calendly/cal.com only if landing needs |

Not a decision yet: owner approval needed before removing packages (never break what works — removal happens only as screens are replaced on branch `staging`).

## Status 2026-09-27

Removed (unused): @radix-ui/themes, framer-motion, motion, vaul, zustand, dayjs, date-fns, canvas-confetti, react-calendly. Still present and in use: @mui/material (25 files) + @mui/icons-material (54) + @mui/x-date-pickers (1) + @mui/material-nextjs, antd (1), chart.js/react-chartjs-2 (3), react-icons (9), @radix-ui/react-icons (1). Next: migrate icons to lucide, Modal to own dialog, charts to ApexCharts.

## Status 2026-09-27 (later)

MUI fully removed (@mui/_, @emotion/_, AppRouterCacheProvider): Modal → `components/ui/Dialog.tsx`; Card/CardContent/CardActions → `components/ui/Card.tsx`; Pagination → `components/ui/Pagination.tsx`; checkbox/radio → `.check`/`.radio` classes; Toggle → own switch button; Loader → lucide spinner; Avatar/Tables/SearchField/FilterPopper rewritten. Remaining old libs: chart.js + react-chartjs-2 (analytics `charts.tsx`, NeonPieChart, legacy FleetDashboard) → replace with ApexCharts later; antd (Assets screen, out of scope); react-icons (`assets/icons/ReactIcon/iconData.ts` + a few files); @radix-ui/react-icons (1 import).

## Status 2026-09-27 (charts)

Analytics `StackedColumns`/`TrendLine` (`components/analytics/charts.tsx`) now render with ApexCharts (same props, tokens-driven colours, glass tooltip via components.css); `chartSetup.ts` and the legacy Fleet hub (`/fleet-management/legacy`, `FleetManagement.tsx`, `FleetDashboard.tsx`) were deleted. Chart.js/react-chartjs-2 remain ONLY for the WebGL twin overlays (`NeonBarChart`, `NeonPieChart`) which are out of scope.
