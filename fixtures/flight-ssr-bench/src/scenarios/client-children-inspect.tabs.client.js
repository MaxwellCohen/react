'use client';

import {Children, useState} from 'react';

// Reads child.type and child.props.title of its server-provided children.
export default function Tabs({children}) {
  const [active, setActive] = useState(0);
  const sections = Children.toArray(children).filter(
    child => child.type === 'section'
  );
  return (
    <div className="tabs">
      <div className="strip">
        {sections.map((child, i) => (
          <button
            key={i}
            className={'tab' + (i === active ? ' selected' : '')}
            onClick={() => setActive(i)}>
            {child.props.title}
          </button>
        ))}
      </div>
      <div className="active">{sections[active]}</div>
    </div>
  );
}
