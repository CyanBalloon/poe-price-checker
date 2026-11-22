import { describe, expect, it } from "vitest";
import { layoutItemSockets } from "@/web/ui/item-socket-layout";

describe("item preview sockets", () => {
  it("follows a six-link chain across and down a two-column item", () => {
    const sockets = ["W", "W", "W", "G", "R", "W"].map(type => ({ type, group: 0 }));
    expect(layoutItemSockets(sockets, 2, true).map(({ row, column, link }) => [row, column, link]))
      .toEqual([
        [1, 1, "right"], [1, 2, "down"],
        [2, 2, "left"], [2, 1, "down"],
        [3, 1, "right"], [3, 2, undefined],
      ]);
  });

  it("ends a link when the socket group changes on a one-column item", () => {
    const sockets = [0, 0, 1].map(group => ({ type: "B", group }));
    const layout = layoutItemSockets(sockets, 1, true);
    expect(layout.map(({ column, link }) => [column, link]))
      .toEqual([[1, "down"], [1, undefined], [1, undefined]]);
  });

  it("keeps PoE2 augments in row order without links", () => {
    const sockets = Array.from({ length: 4 }, () => ({ type: "rune", group: 0 }));
    expect(layoutItemSockets(sockets, 2, false).map(({ column, link }) => [column, link]))
      .toEqual([[1, undefined], [2, undefined], [1, undefined], [2, undefined]]);
  });
});
