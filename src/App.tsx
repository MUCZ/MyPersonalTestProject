import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Crosshair,
  FileText,
  Filter,
  Focus,
  Image,
  Link2,
  MapPin,
  Menu,
  Minus,
  MoreHorizontal,
  Plus,
  Search,
  StickyNote,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  addConnection,
  CARD_HEIGHT,
  CARD_WIDTH,
  deleteEvidence,
  fitBoard,
  loadBoard,
  STORAGE_KEY,
  typeLabels,
  zoomAtPoint,
} from "./board";
import type { BoardData, Connection, Evidence, EvidenceType } from "./board";

const icons = {
  person: UserRound,
  photo: Image,
  document: FileText,
  location: MapPin,
  note: StickyNote,
};
const types: EvidenceType[] = [
  "person",
  "photo",
  "document",
  "location",
  "note",
];
type Viewport = { pan: { x: number; y: number }; zoom: number };
type Drag =
  | { kind: "pan"; x: number; y: number; pan: Viewport["pan"] }
  | {
      kind: "node";
      id: string;
      x: number;
      y: number;
      nodeX: number;
      nodeY: number;
      zoom: number;
    };

function connectionPoints(from: Evidence, to: Evidence) {
  const a = { x: from.x + CARD_WIDTH / 2, y: from.y + CARD_HEIGHT / 2 };
  const b = { x: to.x + CARD_WIDTH / 2, y: to.y + CARD_HEIGHT / 2 };
  const dx = b.x - a.x || 0.001;
  const dy = b.y - a.y || 0.001;
  const ratio = Math.min(
    CARD_WIDTH / 2 / Math.abs(dx),
    CARD_HEIGHT / 2 / Math.abs(dy),
  );
  return {
    x1: a.x + dx * ratio,
    y1: a.y + dy * ratio,
    x2: b.x - dx * ratio,
    y2: b.y - dy * ratio,
  };
}

function EvidenceCard({
  node,
  selected,
  dimmed,
  connecting,
  onPointerDown,
  onSelect,
}: {
  node: Evidence;
  selected: boolean;
  dimmed: boolean;
  connecting: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, id: string) => void;
  onSelect: (id: string) => void;
}) {
  const Icon = icons[node.type];
  return (
    <div
      className={`evidence-card ${node.type} ${selected ? "selected" : ""} ${dimmed ? "dimmed" : ""} ${connecting ? "connect-target" : ""}`}
      style={{ left: node.x, top: node.y }}
      role="button"
      tabIndex={0}
      aria-label={`${typeLabels[node.type]}: ${node.title}. ${node.subtitle}`}
      onPointerDown={(event) => onPointerDown(event, node.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(node.id);
        }
      }}
    >
      <div className="card-pin" aria-hidden="true" />
      <div className="card-topline">
        <span>
          <Icon size={12} strokeWidth={2} /> {node.tag || typeLabels[node.type]}
        </span>
        <MoreHorizontal size={16} />
      </div>
      {node.image ? (
        <div
          className="card-image"
          style={{ backgroundImage: `url("${node.image}")` }}
        />
      ) : node.type === "document" ? (
        <div className="receipt-art" aria-hidden="true">
          <span>THE NIGHT OWL</span>
          <small>DINER · NORTH POINT</small>
          <i />
          <p>
            2 × BLACK COFFEE <b>$ 6.00</b>
          </p>
          <p>
            CASH <b>$ 6.00</b>
          </p>
          <em>11:00 — the usual place</em>
        </div>
      ) : (
        <div className="note-art" aria-hidden="true">
          <span className="note-quote">“</span>
          <span>
            {node.id === "timeline"
              ? "Where did everyone go?"
              : node.id === "unknown"
                ? "Find the face behind the coat."
                : node.description || typeLabels[node.type]}
          </span>
          <div className="note-lines" />
        </div>
      )}
      <div className="card-copy">
        <strong>{node.title}</strong>
        <span>{node.subtitle}</span>
      </div>
      <div className="card-foot">
        <span>{node.date || "NEW EVIDENCE"}</span>
        <ArrowUpRight size={13} />
      </div>
    </div>
  );
}

function App() {
  const [board, setBoard] = useState<BoardData>(() =>
    loadBoard(typeof window !== "undefined" ? window.localStorage : undefined),
  );
  const [viewport, setViewport] = useState<Viewport>({
    pan: { x: 0, y: 0 },
    zoom: 1,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [filter, setFilter] = useState<EvidenceType | "all">("all");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState<EvidenceType>("note");
  const [newTitle, setNewTitle] = useState("");
  const [newSubtitle, setNewSubtitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [toast, setToast] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const didFit = useRef(false);

  const selected = board.nodes.find((node) => node.id === selectedId);
  const activeLink = board.connections.find((link) => link.id === selectedLink);
  const matches = (node: Evidence) =>
    (filter === "all" || node.type === filter) &&
    `${node.title} ${node.subtitle} ${node.description} ${node.tag || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
  const matchCount = board.nodes.filter(matches).length;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
    } catch {
      /* Storage may be disabled. */
    }
  }, [board]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas)
      setViewport(
        fitBoard(board.nodes, canvas.clientWidth, canvas.clientHeight),
      );
  }, [board.nodes]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      if (!didFit.current && canvas.clientWidth && canvas.clientHeight) {
        setViewport(
          fitBoard(board.nodes, canvas.clientWidth, canvas.clientHeight),
        );
        didFit.current = true;
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
    // Fit only on the first measurable layout, not every time a card moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      setViewport((current) =>
        zoomAtPoint(
          current.pan,
          current.zoom,
          current.zoom * Math.exp(-event.deltaY * 0.001),
          point,
        ),
      );
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, []);

  const selectNode = (id: string) => {
    if (connectMode) {
      if (!connectFrom) {
        setConnectFrom(id);
        setToast("Choose a second card to connect");
      } else if (id !== connectFrom) {
        const next = addConnection(board, connectFrom, id);
        setBoard(next);
        setToast(
          next === board
            ? "Those cards are already connected"
            : "Connection added",
        );
        setConnectFrom(null);
        setConnectMode(false);
      }
    } else {
      setSelectedId(id);
      setSelectedLink(null);
    }
  };

  const onCardDown = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    selectNode(id);
    if (connectMode) return;
    const node = board.nodes.find((item) => item.id === id)!;
    dragRef.current = {
      kind: "node",
      id,
      x: event.clientX,
      y: event.clientY,
      nodeX: node.x,
      nodeY: node.y,
      zoom: viewport.zoom,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "pan") {
      setViewport((current) => ({
        ...current,
        pan: {
          x: drag.pan.x + event.clientX - drag.x,
          y: drag.pan.y + event.clientY - drag.y,
        },
      }));
    } else {
      const x = drag.nodeX + (event.clientX - drag.x) / drag.zoom;
      const y = drag.nodeY + (event.clientY - drag.y) / drag.zoom;
      setBoard((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === drag.id ? { ...node, x, y } : node,
        ),
      }));
    }
  };

  const zoomBy = (factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setViewport((current) =>
      zoomAtPoint(current.pan, current.zoom, current.zoom * factor, {
        x: canvas.clientWidth / 2,
        y: canvas.clientHeight / 2,
      }),
    );
  };

  const updateNode = (changes: Partial<Evidence>) => {
    if (!selectedId) return;
    setBoard((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === selectedId ? { ...node, ...changes } : node,
      ),
    }));
  };

  const removeSelected = () => {
    if (selectedId) {
      setBoard((current) => deleteEvidence(current, selectedId));
      setSelectedId(null);
      setToast("Evidence removed");
    }
    if (selectedLink) {
      setBoard((current) => ({
        ...current,
        connections: current.connections.filter((c) => c.id !== selectedLink),
      }));
      setSelectedLink(null);
      setToast("Connection removed");
    }
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable
      )
        return;
      if (event.key === "Escape") {
        setAdding(false);
        setSelectedId(null);
        setSelectedLink(null);
        setConnectMode(false);
        setConnectFrom(null);
        setShowHelp(false);
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        (selectedId || selectedLink)
      ) {
        event.preventDefault();
        removeSelected();
      }
      if (event.key === "+" || event.key === "=") zoomBy(1.2);
      if (event.key === "-") zoomBy(1 / 1.2);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const addEvidence = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newTitle.trim()) return;
    const canvas = canvasRef.current;
    const center = {
      x: (canvas?.clientWidth || 800) / 2,
      y: (canvas?.clientHeight || 600) / 2,
    };
    const node: Evidence = {
      id: crypto.randomUUID(),
      type: newType,
      title: newTitle.trim(),
      subtitle: newSubtitle.trim() || typeLabels[newType],
      description: newDescription.trim(),
      x: (center.x - viewport.pan.x) / viewport.zoom - CARD_WIDTH / 2,
      y: (center.y - viewport.pan.y) / viewport.zoom - CARD_HEIGHT / 2,
      tag: "NEW EVIDENCE",
      date: "JUST ADDED",
    };
    setBoard((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedId(node.id);
    setSelectedLink(null);
    setAdding(false);
    setNewTitle("");
    setNewSubtitle("");
    setNewDescription("");
    setFilter("all");
    setSearch("");
    setToast("Evidence added to board");
  };

  const focusNode = (node: Evidence) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setViewport((current) => ({
      ...current,
      pan: {
        x: canvas.clientWidth / 2 - (node.x + CARD_WIDTH / 2) * current.zoom,
        y: canvas.clientHeight / 2 - (node.y + CARD_HEIGHT / 2) * current.zoom,
      },
    }));
    setSelectedId(node.id);
    setSelectedLink(null);
    setMobileMenu(false);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Crosshair size={22} strokeWidth={1.6} />
          </div>
          <div>
            <strong>PIN & THREAD</strong>
            <span>INVESTIGATION WORKSPACE</span>
          </div>
        </div>
        <div className="sidebar-content">
          <div className="side-label">
            ACTIVE CASE <ChevronDown size={13} />
          </div>
          <div className="case-panel">
            <span className="case-number">CASE FILE / 024</span>
            <h2>
              The Vanishing
              <br />
              Hour<span className="case-dot">.</span>
            </h2>
            <p>What happened to Elias Reed?</p>
            <div className="case-status">
              <span className="pulse-dot" /> INVESTIGATION OPEN{" "}
              <ArrowUpRight size={13} />
            </div>
          </div>

          <div className="side-section-title">
            <span>WORKSPACE</span>
            <MoreHorizontal size={17} />
          </div>
          <button
            className="side-nav active"
            onClick={() => {
              setFilter("all");
              setSearch("");
              setMobileMenu(false);
            }}
          >
            <span className="nav-icon">
              <Crosshair size={17} />
            </span>{" "}
            Investigation board{" "}
            <span className="nav-count">{board.nodes.length}</span>
          </button>
          <button
            className="side-nav"
            onClick={() => {
              setFilter("all");
              setSearch("");
              document.getElementById("evidence-search")?.focus();
            }}
          >
            <span className="nav-icon">
              <FileText size={17} />
            </span>{" "}
            All evidence <ArrowDownRight size={14} className="nav-arrow" />
          </button>

          <div className="side-section-title evidence-heading">
            <span>EVIDENCE INDEX</span>
            <span className="index-count">
              {String(board.nodes.length).padStart(2, "0")}
            </span>
          </div>
          <div className="side-search">
            <Search size={15} />
            <input
              id="evidence-search"
              aria-label="Search evidence"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search evidence..."
            />
            <span>⌘ K</span>
          </div>
          <div className="filter-list">
            <button
              className={`filter-row ${filter === "all" ? "current" : ""}`}
              onClick={() => setFilter("all")}
            >
              <span className="filter-icon all">
                <Filter size={14} />
              </span>{" "}
              All items <span>{board.nodes.length}</span>
            </button>
            {types.map((type) => {
              const Icon = icons[type];
              return (
                <button
                  key={type}
                  className={`filter-row ${filter === type ? "current" : ""}`}
                  onClick={() => setFilter(type)}
                >
                  <span className={`filter-icon ${type}`}>
                    <Icon size={14} />
                  </span>{" "}
                  {typeLabels[type]}{" "}
                  <span>
                    {board.nodes.filter((n) => n.type === type).length}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="sidebar-recent">
            <div className="side-section-title">
              <span>QUICK FIND</span>
            </div>
            {board.nodes.slice(0, 3).map((node) => (
              <button
                key={node.id}
                className="recent-item"
                onClick={() => focusNode(node)}
              >
                <span className="recent-dot" />
                <span>{node.title}</span>
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="avatar">DC</div>
          <div>
            <strong>Detective Cole</strong>
            <span>Lead investigator</span>
          </div>
          <MoreHorizontal size={17} />
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="mobile-menu"
              aria-label="Open menu"
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              <Menu size={21} />
            </button>
            <div className="breadcrumbs">
              WORKSPACE <span>/</span> CASE FILE 024 <span>/</span> <b>BOARD</b>
            </div>
            <h1>
              The Vanishing Hour <span className="title-divider" />{" "}
              <small>Investigation board</small>
            </h1>
          </div>
          <div className="top-actions">
            <span className="saved-indicator">
              <span /> Saved locally
            </span>
            <span className="top-divider" />
            <button
              className={`outline-btn ${connectMode ? "active" : ""}`}
              onClick={() => {
                setConnectMode(!connectMode);
                setConnectFrom(null);
                setSelectedId(null);
                setSelectedLink(null);
              }}
            >
              <Link2 size={16} /> {connectMode ? "Cancel link" : "Connect"}
            </button>
            <button className="primary-btn" onClick={() => setAdding(true)}>
              <Plus size={17} strokeWidth={2.3} /> Add evidence
            </button>
          </div>
        </header>

        <div className="board-toolbar">
          <div className="board-context">
            <span className="live-dot" /> LIVE BOARD{" "}
            <span className="context-separator">/</span>{" "}
            <strong>
              {matchCount} {matchCount === 1 ? "item" : "items"}
            </strong>
            <span className="context-separator">·</span>
            <strong>{board.connections.length} connections</strong>
          </div>
          <div className="board-hint">
            <span>DRAG TO PAN</span>
            <span className="hint-dot">·</span>
            <span>SCROLL TO ZOOM</span>
            <button
              aria-label="Board shortcuts"
              onClick={() => setShowHelp(true)}
            >
              <CircleHelp size={16} />
            </button>
          </div>
        </div>

        <div
          ref={canvasRef}
          className={`canvas ${dragRef.current?.kind === "pan" ? "is-panning" : ""} ${connectMode ? "is-connecting" : ""}`}
          style={
            {
              "--grid-size": `${24 * viewport.zoom}px`,
              "--grid-x": `${viewport.pan.x}px`,
              "--grid-y": `${viewport.pan.y}px`,
            } as CSSProperties
          }
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            setSelectedId(null);
            setSelectedLink(null);
            dragRef.current = {
              kind: "pan",
              x: event.clientX,
              y: event.clientY,
              pan: viewport.pan,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
        >
          <div className="canvas-coordinate">
            N 40° 43′ 12″ <span>·</span> W 73° 59′ 21″
          </div>
          <div
            className="board-stage"
            style={{
              transform: `translate(${viewport.pan.x}px, ${viewport.pan.y}px) scale(${viewport.zoom})`,
            }}
          >
            <svg
              className="connections"
              aria-label="Evidence connections"
              role="img"
            >
              {board.connections.map((link: Connection) => {
                const from = board.nodes.find((node) => node.id === link.from);
                const to = board.nodes.find((node) => node.id === link.to);
                if (!from || !to) return null;
                const { x1, y1, x2, y2 } = connectionPoints(from, to);
                const dim = !matches(from) || !matches(to);
                return (
                  <g
                    key={link.id}
                    className={`connection ${dim ? "dimmed" : ""} ${selectedLink === link.id ? "selected-link" : ""}`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setSelectedLink(link.id);
                      setSelectedId(null);
                    }}
                  >
                    <line x1={x1} y1={y1} x2={x2} y2={y2} />
                    <circle cx={x1} cy={y1} r="4" />
                    <circle cx={x2} cy={y2} r="4" />
                  </g>
                );
              })}
            </svg>
            {board.nodes.map((node) => (
              <EvidenceCard
                key={node.id}
                node={node}
                selected={selectedId === node.id || connectFrom === node.id}
                dimmed={!matches(node)}
                connecting={connectMode}
                onPointerDown={onCardDown}
                onSelect={selectNode}
              />
            ))}
            <svg
              className="connections connection-labels"
              aria-label="Connection labels"
            >
              {board.connections.map((link) => {
                const from = board.nodes.find((node) => node.id === link.from);
                const to = board.nodes.find((node) => node.id === link.to);
                if (!from || !to) return null;
                const { x1, y1, x2, y2 } = connectionPoints(from, to);
                const width = Math.max(76, link.label.length * 7.2 + 24);
                return (
                  <g
                    key={link.id}
                    className={`connection ${!matches(from) || !matches(to) ? "dimmed" : ""} ${selectedLink === link.id ? "selected-link" : ""}`}
                    transform={`translate(${(x1 + x2) / 2}, ${(y1 + y2) / 2})`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setSelectedLink(link.id);
                      setSelectedId(null);
                    }}
                  >
                    <rect
                      x={-width / 2}
                      y="-11"
                      width={width}
                      height="22"
                      rx="4"
                    />
                    <text textAnchor="middle" dominantBaseline="middle">
                      {link.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          {connectMode && (
            <div className="connect-banner">
              <Link2 size={16} />{" "}
              {connectFrom
                ? "Now select another card to link it"
                : "Select the first card to connect"}{" "}
              <button
                onClick={() => {
                  setConnectMode(false);
                  setConnectFrom(null);
                }}
                aria-label="Cancel connection"
              >
                <X size={15} />
              </button>
            </div>
          )}
          {matchCount === 0 && (
            <div className="no-results">
              No matching evidence. Try a different search or filter.
            </div>
          )}
          <div className="canvas-bottom-left">
            <span className="scale-mark" /> INFINITE CANVAS{" "}
            <span className="bottom-separator">/</span> CASE 024
          </div>
          <div className="canvas-controls">
            <button
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => zoomBy(1 / 1.2)}
            >
              <Minus size={17} />
            </button>
            <span>{Math.round(viewport.zoom * 100)}%</span>
            <button
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => zoomBy(1.2)}
            >
              <Plus size={17} />
            </button>
            <span className="control-divider" />
            <button aria-label="Fit board" title="Fit board" onClick={fit}>
              <Focus size={17} />
            </button>
          </div>
        </div>
      </main>

      {(selected || activeLink) && (
        <div
          className="inspector-backdrop"
          onClick={() => {
            setSelectedId(null);
            setSelectedLink(null);
          }}
        />
      )}
      {(selected || activeLink) && (
        <aside className="inspector">
          <div className="inspector-head">
            <span>CASE FILE / DETAILS</span>
            <button
              aria-label="Close details"
              onClick={() => {
                setSelectedId(null);
                setSelectedLink(null);
              }}
            >
              <X size={18} />
            </button>
          </div>
          {selected ? (
            <>
              <div className="inspector-title">
                <span className={`inspector-icon ${selected.type}`}>
                  {(() => {
                    const Icon = icons[selected.type];
                    return <Icon size={20} />;
                  })()}
                </span>
                <small>{typeLabels[selected.type]}</small>
                <h2>{selected.title}</h2>
                <p>
                  Keep the record up to date. Changes are saved automatically on
                  this device.
                </p>
              </div>
              <div className="inspector-fields">
                <label>
                  NAME / TITLE
                  <input
                    value={selected.title}
                    onChange={(e) => updateNode({ title: e.target.value })}
                  />
                </label>
                <label>
                  SUBTITLE
                  <input
                    value={selected.subtitle}
                    onChange={(e) => updateNode({ subtitle: e.target.value })}
                  />
                </label>
                <label>
                  INVESTIGATION NOTES
                  <textarea
                    rows={5}
                    value={selected.description}
                    onChange={(e) =>
                      updateNode({ description: e.target.value })
                    }
                    placeholder="Add your notes here..."
                  />
                </label>
                <label>
                  LABEL
                  <input
                    value={selected.tag || ""}
                    onChange={(e) => updateNode({ tag: e.target.value })}
                  />
                </label>
                <label>
                  IMAGE URL
                  <input
                    value={selected.image || ""}
                    onChange={(e) =>
                      updateNode({ image: e.target.value || undefined })
                    }
                    placeholder="https://..."
                  />
                </label>
              </div>
              <div className="inspector-meta">
                <Clock3 size={15} /> {selected.date || "NEW EVIDENCE"}
              </div>
            </>
          ) : (
            activeLink && (
              <>
                <div className="inspector-title">
                  <span className="inspector-icon link">
                    <Link2 size={20} />
                  </span>
                  <small>Connection</small>
                  <h2>Follow the thread</h2>
                  <p>
                    {board.nodes.find((n) => n.id === activeLink.from)?.title} →{" "}
                    {board.nodes.find((n) => n.id === activeLink.to)?.title}
                  </p>
                </div>
                <div className="inspector-fields">
                  <label>
                    RELATIONSHIP
                    <input
                      value={activeLink.label}
                      onChange={(e) =>
                        setBoard((current) => ({
                          ...current,
                          connections: current.connections.map((c) =>
                            c.id === activeLink.id
                              ? { ...c, label: e.target.value }
                              : c,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
              </>
            )
          )}
          <div className="inspector-footer">
            <button onClick={removeSelected}>
              <Trash2 size={16} /> Delete {selected ? "evidence" : "connection"}
            </button>
          </div>
        </aside>
      )}

      {adding && (
        <div
          className="modal-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setAdding(false);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-head">
              <span>CASE FILE / 024</span>
              <button aria-label="Close" onClick={() => setAdding(false)}>
                <X size={19} />
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-symbol">
                <Plus size={24} />
              </div>
              <h2 id="modal-title">Add to the board</h2>
              <p>
                Every detail is a possible lead. Pin a new piece of evidence to
                your investigation.
              </p>
              <form onSubmit={addEvidence}>
                <label>EVIDENCE TYPE</label>
                <div className="type-picker">
                  {types.map((type) => {
                    const Icon = icons[type];
                    return (
                      <button
                        type="button"
                        key={type}
                        className={newType === type ? "picked" : ""}
                        onClick={() => setNewType(type)}
                        title={typeLabels[type]}
                        aria-label={typeLabels[type]}
                      >
                        <Icon size={19} />
                      </button>
                    );
                  })}
                </div>
                <label htmlFor="new-title">
                  TITLE <span>*</span>
                </label>
                <input
                  id="new-title"
                  required
                  autoFocus
                  maxLength={70}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="What did you find?"
                />
                <label htmlFor="new-subtitle">SUBTITLE</label>
                <input
                  id="new-subtitle"
                  maxLength={90}
                  value={newSubtitle}
                  onChange={(e) => setNewSubtitle(e.target.value)}
                  placeholder="A short detail or timestamp"
                />
                <label htmlFor="new-notes">NOTES</label>
                <textarea
                  id="new-notes"
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Add what you know so far..."
                />
                <div className="modal-actions">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => setAdding(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="primary-btn">
                    <Plus size={17} /> Add evidence
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {showHelp && (
        <div
          className="modal-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setShowHelp(false);
          }}
        >
          <div
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <button
              className="help-close"
              aria-label="Close"
              onClick={() => setShowHelp(false)}
            >
              <X size={19} />
            </button>
            <Activity size={23} />
            <h2 id="help-title">Work the case</h2>
            <p>There is always another thread to follow.</p>
            <div>
              <span>Drag empty space</span>
              <b>Pan the canvas</b>
            </div>
            <div>
              <span>Scroll / + / −</span>
              <b>Zoom in or out</b>
            </div>
            <div>
              <span>Drag a card</span>
              <b>Rearrange evidence</b>
            </div>
            <div>
              <span>Connect → two cards</span>
              <b>Draw a relationship</b>
            </div>
            <div>
              <span>Click a card or thread</span>
              <b>Edit its details</b>
            </div>
            <div>
              <span>Delete / Escape</span>
              <b>Remove / dismiss</b>
            </div>
            <button className="primary-btn" onClick={() => setShowHelp(false)}>
              <Check size={16} /> Got it
            </button>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast">
          <Check size={15} /> {toast}
        </div>
      )}
      <div className="sr-only">
        {connectMode ? "Connection mode active" : ""}
      </div>
    </div>
  );
}

export default App;
