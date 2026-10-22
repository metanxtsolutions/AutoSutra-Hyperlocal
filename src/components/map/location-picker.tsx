"use client";

import { useState } from "react";
import { LocationMap } from "./location-map";
import { useFormState } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/form";

/** Latitude / longitude / radius inputs synchronised with a clickable map. */
export function LocationPicker({
  defaultLat,
  defaultLng,
  defaultRadius = 5,
  others = [],
}: {
  defaultLat?: number;
  defaultLng?: number;
  defaultRadius?: number;
  others?: { id: string; name: string; lat: number; lng: number; radiusKm: number }[];
}) {
  const state = useFormState();
  const [lat, setLat] = useState(state.values?.latitude ?? (defaultLat !== undefined ? String(defaultLat) : ""));
  const [lng, setLng] = useState(state.values?.longitude ?? (defaultLng !== undefined ? String(defaultLng) : ""));
  const [radius, setRadius] = useState(state.values?.defaultRadiusKm ?? String(defaultRadius));
  const latN = Number(lat);
  const lngN = Number(lng);
  const points = [
    ...others.map((o) => ({ ...o, tone: "muted" as const })),
    ...(lat && lng && Number.isFinite(latN) && Number.isFinite(lngN) ? [{ id: "this", name: "This location", lat: latN, lng: lngN, radiusKm: Number(radius) || undefined }] : []),
  ];
  return (
    <div className="space-y-3">
      <LocationMap points={points} onPick={(a, b) => { setLat(String(a)); setLng(String(b)); }} height={320} label="Click the map to set the location pin" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Latitude" name="latitude" required error={state.fieldErrors?.latitude}>
          <Input name="latitude" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} invalid={!!state.fieldErrors?.latitude} />
        </Field>
        <Field label="Longitude" name="longitude" required error={state.fieldErrors?.longitude}>
          <Input name="longitude" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} invalid={!!state.fieldErrors?.longitude} />
        </Field>
        <Field label="Default radius (km)" name="defaultRadiusKm" required error={state.fieldErrors?.defaultRadiusKm} hint="Common choices: 1, 3, 5 or 10 km. Range 1 to 80.">
          <Input name="defaultRadiusKm" type="number" min={1} max={80} step={1} value={radius} onChange={(e) => setRadius(e.target.value)} list="radius-presets" />
          <datalist id="radius-presets">
            {[1, 3, 5, 10, 15, 25].map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
      </div>
      <p className="text-xs text-ink-500">Click the map to place the pin, or type coordinates from Google Maps (right-click a place, then copy the coordinates).</p>
    </div>
  );
}
