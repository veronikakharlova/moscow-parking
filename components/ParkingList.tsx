import type { ParkingRow } from "@/lib/supabaseClient";

export default function ParkingList({ parkings }: { parkings: ParkingRow[] }) {
  if (parkings.length === 0) {
    return (
      <p className="empty-state">
        Пока нет ни одной парковки — как только в канале появится новый пост, он придёт сюда автоматически.
      </p>
    );
  }

  return (
    <ul className="parking-list">
      {parkings.map((p) => (
        <li key={p.id} className="parking-item">
          <div className="address">{p.address}</div>
          {p.source_url && (
            <a className="source-link" href={p.source_url} target="_blank" rel="noreferrer">
              Открыть на карте →
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
