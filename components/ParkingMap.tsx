"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ParkingRow } from "@/lib/supabaseClient";

// У Leaflet при сборке через бандлер (Next/webpack) ломаются пути к иконкам маркера —
// это известная особенность библиотеки, чинится через переопределение на CDN-адреса.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Центр Москвы — используется, если в базе ещё нет ни одной парковки с координатами
const MOSCOW_CENTER: [number, number] = [55.751244, 37.618423];

export default function ParkingMap({ parkings }: { parkings: ParkingRow[] }) {
  const withCoords = parkings.filter(
    (p): p is ParkingRow & { lat: number; lng: number } => p.lat !== null && p.lng !== null
  );

  const center: [number, number] =
    withCoords.length > 0 ? [withCoords[0].lat, withCoords[0].lng] : MOSCOW_CENTER;

  return (
    <MapContainer center={center} zoom={11} scrollWheelZoom className="map-container">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {withCoords.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]}>
          <Popup>
            <strong>{p.address}</strong>
            {p.source_url && (
              <>
                <br />
                <a href={p.source_url} target="_blank" rel="noreferrer">
                  Открыть на карте
                </a>
              </>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
