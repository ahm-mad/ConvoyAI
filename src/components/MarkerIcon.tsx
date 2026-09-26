// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Brand pin drawn with CSS (.brand-pin in components.css) so it follows the design tokens.
const customIcon = L.divIcon({
  className: 'brand-pin-wrap',
  html: '<span class="brand-pin"></span>',
  iconSize: [28, 36],
  iconAnchor: [14, 36],
  popupAnchor: [0, -32],
});

const MarkerIcon = ({ position, popupText }) => {
  return (
    <Marker position={position} icon={customIcon}>
      <Popup>{popupText}</Popup>
    </Marker>
  );
};

export default MarkerIcon;
