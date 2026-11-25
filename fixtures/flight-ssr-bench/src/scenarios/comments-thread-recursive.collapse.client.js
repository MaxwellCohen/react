'use client';

import {useState} from 'react';

export default function CollapseAll() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <button className="collapse-all" onClick={() => setCollapsed(!collapsed)}>
      {collapsed ? 'Expand all' : 'Collapse all'}
    </button>
  );
}
