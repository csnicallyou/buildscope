import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { OfKind } from "./construction";

export default function PortfolioMap({
  sites,
  selected,
  onSelect,
}: {
  sites: OfKind<"node">[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  const currentSites = useRef(sites);
  currentSites.current = sites;
  const locationsKey = JSON.stringify(
    sites.map((s) => [s.id, s.payload.title, s.payload.location]),
  );
  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([55.75, 37.62], 9);
    const tiles = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        referrerPolicy: "strict-origin-when-cross-origin",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    ).addTo(map);
    tiles.on("tileerror", () => setFailed(true));
    tiles.on("tileload", () => setFailed(false));
    const points: L.LatLngTuple[] = [];
    for (const site of currentSites.current) {
      const p = site.payload.location;
      if (!p) continue;
      points.push([p.lat, p.lng]);
      const label = document.createElement("span");
      label.textContent = site.payload.title;
      L.circleMarker([p.lat, p.lng], {
        radius: site.id === selected ? 12 : 8,
        color: "#fff",
        weight: 3,
        fillColor: site.id === selected ? "#1261ed" : "#536a83",
        fillOpacity: 1,
      })
        .addTo(map)
        .bindTooltip(label, { permanent: true, direction: "right" })
        .on("click", () => callback.current(site.id));
    }
    if (points.length)
      map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 14 });
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      map.remove();
    };
  }, [locationsKey, selected]);
  return (
    <div className="portfolio-cartography">
      <div
        ref={container}
        aria-label="Карта объектов OpenStreetMap"
        className="portfolio-map"
      />
      {!sites.some((s) => s.payload.location) && (
        <div className="map-explanation">
          <strong>Объекты ещё не размещены на карте</strong>
          <span>
            Укажите координаты в карточке объекта. Пока показана обзорная карта
            региона без маркеров.
          </span>
        </div>
      )}
      {failed && (
        <div className="map-network-note" role="status">
          Подложка недоступна. Список объектов и работа с данными остаются
          доступны.
        </div>
      )}
    </div>
  );
}
