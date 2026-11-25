'use client';

import {createContext, useContext} from 'react';

export const ThemeContext = createContext('light');

export default function ThemeLayout({children}) {
  const theme = useContext(ThemeContext);
  return (
    <div className="layout theme" data-outer={theme}>
      <ThemeContext.Provider value="dark">{children}</ThemeContext.Provider>
    </div>
  );
}
