'use client';

import {useContext, useState} from 'react';
import {ThemeContext} from './nested-layouts-context.theme.client';
import {LocaleContext} from './nested-layouts-context.locale.client';
import {UserContext} from './nested-layouts-context.user.client';

export default function Leaf() {
  const theme = useContext(ThemeContext);
  const locale = useContext(LocaleContext);
  const user = useContext(UserContext);
  const [label, setLabel] = useState(theme);
  return (
    <button
      className="leaf"
      onClick={() => setLabel(v => (v === theme ? theme + '-alt' : theme))}>
      theme={label} locale={locale} user={user.name}
    </button>
  );
}
