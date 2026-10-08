import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title: string;
  urgent?: boolean;
}

interface Props {
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  me?: { lat: number; lng: number } | null;
  radiusKm?: number;
  /** Address-picker mode: one draggable pin; tap or drag to move. */
  pin?: { lat: number; lng: number } | null;
  onPinChange?: (p: { lat: number; lng: number }) => void;
  onMarkerClick?: (id: string) => void;
  className?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Leaflet + OpenStreetMap tiles (no API key, no paid services). */
export default function MapView({ center, zoom = 13, markers = [], me, radiusKm, pin, onPinChange, onMarkerClick, className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const pinMarker = useRef<L.Marker | null>(null);
  const onPinRef = useRef(onPinChange);
  const onClickRef = useRef(onMarkerClick);
  onPinRef.current = onPinChange;
  onClickRef.current = onMarkerClick;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (onPinRef.current) onPinRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    map.current = m;
    // Leaflet needs a size recalculation when mounted inside animated/hidden containers.
    setTimeout(() => m.invalidateSize(), 150);
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    map.current?.setView([center.lat, center.lng], map.current.getZoom() || zoom);
  }, [center.lat, center.lng, zoom]);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    if (me) {
      L.marker([me.lat, me.lng], { icon: L.divIcon({ className: '', html: '<div class="ss-marker me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), keyboard: false }).addTo(g);
      if (radiusKm) L.circle([me.lat, me.lng], { radius: radiusKm * 1000, color: '#8FBF6C', weight: 1.5, fillOpacity: 0.06 }).addTo(g);
    }
    const bounds: L.LatLngExpression[] = [];
    for (const mk of markers) {
      const marker = L.marker([mk.lat, mk.lng], {
        title: mk.title,
        icon: L.divIcon({
          className: '',
          html: `<div class="ss-marker${mk.urgent ? ' urgent' : ''}"><span>${esc(mk.label)}</span></div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 30],
        }),
      }).addTo(g);
      marker.bindTooltip(esc(mk.title));
      marker.on('click', () => onClickRef.current?.(mk.id));
      bounds.push([mk.lat, mk.lng]);
    }
    if (bounds.length && me) {
      bounds.push([me.lat, me.lng]);
      m.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15 });
    }
  }, [markers, me, radiusKm]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!pin) {
      pinMarker.current?.remove();
      pinMarker.current = null;
      return;
    }
    if (!pinMarker.current) {
      pinMarker.current = L.marker([pin.lat, pin.lng], {
        draggable: true,
        icon: L.divIcon({ className: '', html: '<div class="ss-marker urgent"><span>●</span></div>', iconSize: [30, 30], iconAnchor: [15, 30] }),
      }).addTo(m);
      pinMarker.current.on('dragend', () => {
        const p = pinMarker.current!.getLatLng();
        onPinRef.current?.({ lat: p.lat, lng: p.lng });
      });
    } else {
      pinMarker.current.setLatLng([pin.lat, pin.lng]);
    }
    m.setView([pin.lat, pin.lng], Math.max(m.getZoom(), 15));
  }, [pin?.lat, pin?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className={className ?? 'h-80 w-full'} role="region" aria-label="Map" />;
}
