'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'react';

export interface GymPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  total: number;
  favorite: boolean;
}

const SEOUL: L.LatLngTuple = [37.5465, 126.99];

function level(total: number, busyThreshold: number): 'busy' | 'some' | 'none' {
  return total >= busyThreshold ? 'busy' : total > 0 ? 'some' : 'none';
}

function icon(p: GymPoint, busyThreshold: number, selected: boolean): L.DivIcon {
  const el = document.createElement('span');
  el.className = 'gym-pin';
  el.dataset.level = level(p.total, busyThreshold);
  el.dataset.favorite = String(p.favorite);
  el.dataset.selected = String(selected);
  el.textContent = String(p.total);
  return L.divIcon({ html: el, className: '', iconSize: [34, 34], iconAnchor: [17, 17] });
}

export default function GymMap(props: {
  points: GymPoint[];
  busyThreshold: number;
  selectedId: string | null;
  onSelect(id: string): void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const onSelect = useRef(props.onSelect);
  useEffect(() => {
    onSelect.current = props.onSelect;
  });
  // Fit the map to the gyms once, when they first arrive; after that the user owns the viewport.
  const fitted = useRef(false);

  useEffect(() => {
    const m = L.map(container.current!, { zoomControl: false, attributionControl: true }).setView(SEOUL, 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    if (!m || !group) return;
    group.clearLayers();
    // Busiest on top so a crowded gym is never hidden under an empty neighbour.
    const sorted = [...props.points].sort((a, b) => a.total - b.total);
    for (const p of sorted) {
      const selected = p.id === props.selectedId;
      L.marker([p.lat, p.lon], {
        icon: icon(p, props.busyThreshold, selected),
        title: `${p.name} ${p.total}명`,
        zIndexOffset: selected ? 10000 : p.total * 10,
      })
        .on('click', () => onSelect.current(p.id))
        .addTo(group);
    }
    if (!fitted.current && props.points.length) {
      fitted.current = true;
      const bounds = L.latLngBounds(props.points.map((p) => [p.lat, p.lon]));
      m.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
    }
  }, [props.points, props.busyThreshold, props.selectedId]);

  return <div ref={container} className="h-full w-full overflow-hidden rounded-2xl border border-black/10 dark:border-white/15" />;
}
