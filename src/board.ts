export type EvidenceType =
  "person" | "photo" | "document" | "location" | "note";

export interface Evidence {
  id: string;
  type: EvidenceType;
  title: string;
  subtitle: string;
  description: string;
  x: number;
  y: number;
  image?: string;
  tag?: string;
  date?: string;
}

export interface Connection {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface BoardData {
  nodes: Evidence[];
  connections: Connection[];
}

export const typeLabels: Record<EvidenceType, string> = {
  person: "Person of interest",
  photo: "Photograph",
  document: "Document",
  location: "Location",
  note: "Field note",
};

export const initialBoard: BoardData = {
  nodes: [
    {
      id: "mara",
      type: "person",
      title: "Mara Voss",
      subtitle: "Last person to see Elias",
      description:
        "Gallery curator. Claims she left the exhibition at 9:15 PM, but her car was still in the lot after midnight.",
      x: 360,
      y: 70,
      tag: "PRIMARY SUSPECT",
      date: "INTERVIEWED OCT 18",
      image:
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=560&q=85",
    },
    {
      id: "polaroid",
      type: "photo",
      title: "The last photograph",
      subtitle: "Taken at 11:42 PM",
      description:
        "An anonymous photograph slipped under the precinct door. The figure near the window has not been identified.",
      x: 47,
      y: 275,
      tag: "EVIDENCE 001",
      date: "OCT 17 · 11:42 PM",
      image:
        "https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=600&q=85",
    },
    {
      id: "timeline",
      type: "note",
      title: "The missing hour",
      subtitle: "10:30 PM — 11:30 PM",
      description:
        "Nobody can account for the hour between the gallery closing and the first call to dispatch. Something happened in that window.",
      x: 697,
      y: 265,
      tag: "KEY QUESTION",
      date: "TIMELINE",
    },
    {
      id: "elias",
      type: "person",
      title: "Elias Reed",
      subtitle: "Missing since October 17",
      description:
        "Investigative journalist. Was researching the old observatory and a series of missing persons cases before he disappeared.",
      x: 1020,
      y: 85,
      tag: "MISSING PERSON",
      date: "CASE SUBJECT",
      image:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=560&q=85",
    },
    {
      id: "observatory",
      type: "location",
      title: "North Point Observatory",
      subtitle: "4.2 miles from the gallery",
      description:
        "Abandoned since 1987. A security camera on the access road captured headlights at 11:08 PM.",
      x: 330,
      y: 560,
      tag: "LOCATION 003",
      date: "NORTH POINT",
      image:
        "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=620&q=85",
    },
    {
      id: "receipt",
      type: "document",
      title: "A receipt, no name",
      subtitle: "Found in Elias’s coat",
      description:
        "A receipt for two coffees from the all-night diner. One paid in cash. The back reads “11:00 — the usual place.”",
      x: 762,
      y: 605,
      tag: "EVIDENCE 004",
      date: "OCT 17 · 10:56 PM",
    },
    {
      id: "unknown",
      type: "note",
      title: "Who was the second person?",
      subtitle: "An open thread",
      description:
        "The diner footage shows Elias with someone in a dark coat. Their face is obscured in every frame.",
      x: 1095,
      y: 478,
      tag: "UNRESOLVED",
      date: "FOLLOW UP",
    },
  ],
  connections: [
    { id: "c1", from: "polaroid", to: "mara", label: "seen together" },
    { id: "c2", from: "mara", to: "timeline", label: "alibi gap" },
    { id: "c3", from: "timeline", to: "elias", label: "last seen" },
    { id: "c4", from: "polaroid", to: "observatory", label: "same location?" },
    { id: "c5", from: "observatory", to: "receipt", label: "4.2 miles" },
    { id: "c6", from: "receipt", to: "unknown", label: "two coffees" },
    { id: "c7", from: "elias", to: "unknown", label: "unidentified" },
  ],
};

export const CARD_WIDTH = 246;
export const CARD_HEIGHT = 224;
export const STORAGE_KEY = "detective-board-v1";

export function loadBoard(
  storage: Pick<Storage, "getItem"> | undefined,
): BoardData {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return initialBoard;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as BoardData).nodes) &&
      Array.isArray((parsed as BoardData).connections)
    ) {
      return parsed as BoardData;
    }
  } catch {
    /* Ignore corrupt or unavailable local storage. */
  }
  return initialBoard;
}

export function addConnection(
  board: BoardData,
  from: string,
  to: string,
): BoardData {
  if (
    from === to ||
    !board.nodes.some((n) => n.id === from) ||
    !board.nodes.some((n) => n.id === to) ||
    board.connections.some(
      (c) =>
        (c.from === from && c.to === to) || (c.from === to && c.to === from),
    )
  )
    return board;
  return {
    ...board,
    connections: [
      ...board.connections,
      { id: crypto.randomUUID(), from, to, label: "connected to" },
    ],
  };
}

export function deleteEvidence(board: BoardData, id: string): BoardData {
  return {
    nodes: board.nodes.filter((node) => node.id !== id),
    connections: board.connections.filter((c) => c.from !== id && c.to !== id),
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(1.8, Math.max(0.35, zoom));
}

export function zoomAtPoint(
  pan: { x: number; y: number },
  oldZoom: number,
  newZoom: number,
  point: { x: number; y: number },
) {
  const zoom = clampZoom(newZoom);
  return {
    zoom,
    pan: {
      x: point.x - ((point.x - pan.x) * zoom) / oldZoom,
      y: point.y - ((point.y - pan.y) * zoom) / oldZoom,
    },
  };
}

export function fitBoard(nodes: Evidence[], width: number, height: number) {
  if (!nodes.length) return { zoom: 1, pan: { x: width / 2, y: height / 2 } };
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + CARD_WIDTH));
  const maxY = Math.max(...nodes.map((n) => n.y + CARD_HEIGHT));
  const zoom = clampZoom(
    Math.min(1, (width - 120) / (maxX - minX), (height - 105) / (maxY - minY)),
  );
  return {
    zoom,
    pan: {
      x: (width - (maxX + minX) * zoom) / 2,
      y: (height - (maxY + minY) * zoom) / 2,
    },
  };
}
