import { Link } from "@tanstack/react-router";

type PageLinksProps = {
  to: "/orders" | "/disputes";
  filters: Record<string, string | undefined>;
  prevCursor: string | null;
  nextCursor: string | null;
};

// Previous and Next links for a keyset list. The filters go along, so each page is still the filtered one.
export function PageLinks({ to, filters, prevCursor, nextCursor }: PageLinksProps) {
  return (
    <p>
      {prevCursor && (
        <Link to={to} search={{ ...filters, cursor: prevCursor, direction: "prev" }}>
          Previous page
        </Link>
      )}{" "}
      {nextCursor && (
        <Link to={to} search={{ ...filters, cursor: nextCursor, direction: "next" }}>
          Next page
        </Link>
      )}
    </p>
  );
}
