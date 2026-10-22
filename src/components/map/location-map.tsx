"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusKm?: number;
  tone?: "brand" | "road" | "muted";
  href?: string;
}

const COLORS = { brand: "#d97706", road: "#2563eb", muted: "#5b6f93" };
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? "&copy; OpenStreetMap contributors";

/**
 * Map of locations with their radius circles. When `onPick` is given, clicking
 * the map reports the clicked coordinates (used by the location form).
 */
export function LocationMap({
  points,
  height = 360,
  onPick,
  className,
  label = "Map of dealership locations and target areas",
}: {
  points: MapPoint[];
  height?: number;
  onPick?: (lat: number, lng: number) => void;
  className?: string;
  label?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !container.current || mapRef.current) return;
      const map = L.map(container.current, { scrollWheelZoom: false }).setView([20.6, 78.9], 5);
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 18 }).addTo(map);
      map.on("click", (e) => pickRef.current?.(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))));
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      draw(L);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      if (!mapRef.current) return;
      draw(await import("leaflet"));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points)]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  function draw(L: typeof import("leaflet")) {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds: [number, number][] = [];
    for (const p of points) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      const color = COLORS[p.tone ?? "brand"];
      if (p.radiusKm) {
        const circle = L.circle([p.lat, p.lng], { radius: p.radiusKm * 1000, color, weight: 2, dashArray: "6 6", fillOpacity: 0.12 });
        circle.addTo(layer);
        const b = circle.getBounds();
        bounds.push([b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]);
      } else {
        bounds.push([p.lat, p.lng]);
      }
      const marker = L.circleMarker([p.lat, p.lng], { radius: 7, color: "#0f1b31", weight: 2, fillColor: color, fillOpacity: 1 });
      const safeName = p.name.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
      marker.bindTooltip(`${safeName}${p.radiusKm ? ` · ${p.radiusKm} km` : ""}`);
      marker.addTo(layer);
    }
    if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
  }

  return (
    <div className={className}>
      <div ref={container} role="region" aria-label={label} style={{ height }} className="z-0 w-full overflow-hidden rounded-lg border border-ink-200 bg-ink-100" />
      <p className="mt-1.5 text-xs text-ink-500">
        Circles show the requested target radius. Ad platforms estimate location from device and profile signals, so actual delivery is approximate.
      </p>
    </div>
  );
}
