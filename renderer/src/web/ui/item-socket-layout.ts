import type { DisplayItem } from "@/web/price-check/trade/pathofexile-trade";

export function layoutItemSockets(sockets: DisplayItem["sockets"], width: number, showLinks: boolean) {
  const columns = Math.max(1, Math.min(width, sockets.length));
  const positions = sockets.map((socket, index) => {
    const row = Math.floor(index / columns);
    const offset = index % columns;
    // The chain alternates direction on each row so adjacent sockets share an edge.
    const column = showLinks && row % 2 === 1 ? columns - offset - 1 : offset;
    return { socket, row: row + 1, column: column + 1 };
  });
  return positions.map((position, index) => {
    const next = positions[index + 1];
    const sharesGroup = showLinks && typeof position.socket.group === "number" &&
      next?.socket.group === position.socket.group;
    if (!sharesGroup) return { ...position, link: undefined };
    const horizontal = next.column > position.column ? "right" : "left";
    const link = next.row !== position.row ? "down" : horizontal;
    return { ...position, link };
  });
}
