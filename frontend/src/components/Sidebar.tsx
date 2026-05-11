import { NavLink } from "react-router-dom";
import { useState } from "react";
import type { NodeState } from "../hooks/useWebSocket";
import { useLanguage } from "../context/LanguageContext";

type SidebarProps = {
  nodes: NodeState[];
};

export function Sidebar({ nodes }: SidebarProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button className="hamburger-button" onClick={() => setIsOpen((value) => !value)}>
        ☰
      </button>
      <aside className={`sidebar ${isOpen ? "open" : ""}`}>
        <h2>{t.nodes}</h2>
        {nodes.length === 0 ? (
          <p className="muted">{t.noNodes}</p>
        ) : (
          <ul>
            {nodes.map((node) => (
              <li key={node.nodeId}>
                <span className={node.online ? "dot online" : "dot offline"} />
                <span>{node.alias?.trim() || node.hostname}</span>
                <span className="muted tiny">{node.online ? t.online : t.offline}</span>
              </li>
            ))}
          </ul>
        )}
        <nav className="sidebar-links">
          <NavLink to="/" onClick={() => setIsOpen(false)}>
            {t.nodes}
          </NavLink>
          <NavLink to="/stats" onClick={() => setIsOpen(false)}>
            {t.stats}
          </NavLink>
          <NavLink to="/alerts" onClick={() => setIsOpen(false)}>
            {t.alerts}
          </NavLink>
        </nav>
      </aside>
    </>
  );
}
