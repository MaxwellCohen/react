'use client';

import {useState} from 'react';

// Collapses the server-rendered sidebar passed as children. Collapsed, the
// sidebar is unmounted; opening it again mounts the same server output.
export default function Collapse({children}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="sidebar-wrap">
      <button
        className="collapse-toggle"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? 'Show sidebar' : 'Hide sidebar'}
      </button>
      {collapsed ? null : children}
    </div>
  );
}
