import { IncursionRoom } from "@/parser/ParsedItem";
import type { StatFilter } from "../interfaces";

const defaultRooms = new Set([
  "pseudo.pseudo_temple_gem_room_3", // Doryani's Institute
  "pseudo.pseudo_temple_corruption_room_3", // Locus of Corruption
  "pseudo.pseudo_temple_cartography_room_3", // Atlas of Worlds
  "pseudo.pseudo_temple_apex", // Apex of Atzoatl
]);

export function applyRules(filters: StatFilter[]) {
  for (const filter of filters) {
    filter.disabled = !filter.tradeId.some(id => defaultRooms.has(id));
    if (filter.option && filter.tradeId.some(id => id.startsWith("pseudo.pseudo_temple_"))) {
      filter.option.value = IncursionRoom.Open;
    }
  }
}
