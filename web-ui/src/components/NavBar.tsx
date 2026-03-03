'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { logout, isAuthenticated } from '../services/api/auth';

const Navbar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(isAuthenticated());
  }, [pathname]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (!isLoggedIn) {
    return null;
  }

  return (
    <nav className="bg-primary p-4 text-primary-foreground">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex space-x-4">
          <a href="/" className="hover:bg-primary/80 px-3 py-2 rounded">
            Create new
          </a>
          <a
            href="/manage"
            className="hover:bg-primary/80 px-3 py-2 rounded-md text-sm font-medium"
          >
            Manage
          </a>
          <a
            href="/profile"
            className="hover:bg-primary/80 px-3 py-2 rounded-md text-sm font-medium"
          >
            Profile
          </a>
        </div>
        <button
          onClick={handleLogout}
          className="ml-4 bg-background hover:text-primary text-foreground py-2 px-4 rounded text-sm font-medium focus:outline-none focus:shadow-outline"
        >
          Logout
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
