import { describe, expect, it } from "vitest";
import {
  addConnection,
  clampZoom,
  deleteEvidence,
  fitBoard,
  initialBoard,
  loadBoard,
  STORAGE_KEY,
  zoomAtPoint,
} from "./board";

describe("board data", () => {
  it("starts with the sample case when storage is empty or invalid", () => {
    expect(loadBoard(undefined)).toBe(initialBoard);
    expect(loadBoard({ getItem: () => "{broken" })).toBe(initialBoard);
    expect(loadBoard({ getItem: () => JSON.stringify({ nodes: [] }) })).toBe(
      initialBoard,
    );
  });

  it("restores a saved board", () => {
    const board = { nodes: [], connections: [] };
    expect(
      loadBoard({
        getItem: (key) => (key === STORAGE_KEY ? JSON.stringify(board) : null),
      }),
    ).toEqual(board);
  });

  it("adds only valid, distinct connections", () => {
    const board = addConnection(initialBoard, "mara", "receipt");
    expect(board.connections).toHaveLength(initialBoard.connections.length + 1);
    expect(addConnection(board, "receipt", "mara")).toBe(board);
    expect(addConnection(board, "mara", "mara")).toBe(board);
    expect(addConnection(board, "missing", "mara")).toBe(board);
  });

  it("removes a card and all of its relationships", () => {
    const board = deleteEvidence(initialBoard, "mara");
    expect(board.nodes.some((node) => node.id === "mara")).toBe(false);
    expect(
      board.connections.some(
        (link) => link.from === "mara" || link.to === "mara",
      ),
    ).toBe(false);
    expect(board.connections).toHaveLength(initialBoard.connections.length - 2);
  });
});

describe("canvas geometry", () => {
  it("keeps the world point beneath the cursor while zooming", () => {
    const pan = { x: -120, y: 40 };
    const cursor = { x: 375, y: 250 };
    const next = zoomAtPoint(pan, 0.8, 1.2, cursor);
    expect((cursor.x - pan.x) / 0.8).toBeCloseTo(
      (cursor.x - next.pan.x) / next.zoom,
    );
    expect((cursor.y - pan.y) / 0.8).toBeCloseTo(
      (cursor.y - next.pan.y) / next.zoom,
    );
  });

  it("limits zoom and fits all cards into the available viewport", () => {
    expect(clampZoom(0.01)).toBe(0.35);
    expect(clampZoom(4)).toBe(1.8);
    const result = fitBoard(initialBoard.nodes, 1200, 800);
    for (const node of initialBoard.nodes) {
      expect(node.x * result.zoom + result.pan.x).toBeGreaterThanOrEqual(0);
      expect(node.y * result.zoom + result.pan.y).toBeGreaterThanOrEqual(0);
      expect((node.x + 246) * result.zoom + result.pan.x).toBeLessThanOrEqual(
        1200,
      );
      expect((node.y + 224) * result.zoom + result.pan.y).toBeLessThanOrEqual(
        800,
      );
    }
  });
});
