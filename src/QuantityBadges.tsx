import { quantityStatuses, type QuantityStatus } from "./quality";
export default function QuantityBadges({
  statuses,
}: {
  statuses: QuantityStatus[];
}) {
  return (
    <span className="quantity-badges">
      {[...new Set(statuses)].map((status) => (
        <span
          key={status}
          className={`quantity-badge quality-${status}`}
          title={quantityStatuses[status].detail}
        >
          {quantityStatuses[status].label}
        </span>
      ))}
    </span>
  );
}
