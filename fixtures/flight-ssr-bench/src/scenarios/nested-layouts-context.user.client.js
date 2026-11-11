'use client';

import {createContext, useContext} from 'react';

export const UserContext = createContext(null);

export default function UserLayout({children}) {
  const user = useContext(UserContext);
  return (
    <div className="layout user" data-outer={user ? user.name : 'none'}>
      <UserContext.Provider value={{name: 'Ada', role: 'admin'}}>
        {children}
      </UserContext.Provider>
    </div>
  );
}
