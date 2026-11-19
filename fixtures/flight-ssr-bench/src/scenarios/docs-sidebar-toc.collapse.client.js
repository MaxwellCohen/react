'use client';

import {useState} from 'react';

// Only toggles state on its own rendered button (attribute + label).
export default function Collapse() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <button
      className="collapse-toggle"
      data-collapsed={collapsed ? 'true' : 'false'}
      aria-expanded={!collapsed}
      onClick={() => setCollapsed(!collapsed)}>
      {collapsed ? 'Sidebar: collapsed' : 'Sidebar: open'}
    </button>
  );
}
