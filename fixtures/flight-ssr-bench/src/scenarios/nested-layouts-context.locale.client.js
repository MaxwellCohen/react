'use client';

import {createContext, useContext} from 'react';

export const LocaleContext = createContext('en');

export default function LocaleLayout({children}) {
  const locale = useContext(LocaleContext);
  return (
    <div className="layout locale" data-outer={locale}>
      <LocaleContext.Provider value="en-US">{children}</LocaleContext.Provider>
    </div>
  );
}
