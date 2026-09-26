'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { disconnectSocket } from '@contexts/SocketContext';
import type { User } from '../types/api';
import { resolveImageUrl } from '@utils/avatar';
import { isShowcase, showcaseIdentity } from '@utils/showcase';

interface UserContextValue {
  user: User | null;
  token: string | null;
  handleLogin: (userData: User, token: string) => void;
  handleLogout: () => void;
  updateUser: (newUserData: User) => void;
  hasRole: (role: string) => boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  isLoggedIn: boolean;
  uploadedImage: string | null;
  setUploadedImage: React.Dispatch<React.SetStateAction<string | null>>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  // NOTE (Next migration): `useNavigate()` (react-router) removed — it was never
  // used (handleLogout redirects via `window.location.href`). App Router routing
  // hooks come from 'next/navigation' where actually needed.

  const storedUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
  const parsedUser: User | null = storedUser ? JSON.parse(storedUser) : null;
  // Showcase data: present a demo identity instead of the real login (display only; storage untouched).
  const initialUser: User | null =
    parsedUser && isShowcase() ? { ...parsedUser, ...showcaseIdentity() } : parsedUser;

  const [user, setUser] = useState<User | null>(initialUser);
  const [token, setToken] = useState<string | null>(
    () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null) || null
  );

  // Avatar URL shown in the header / popper / account settings. `null` = no picture (UI shows the
  // user's initial). The API returns absolute CDN URLs; legacy relative paths are resolved too.
  const [uploadedImage, setUploadedImage] = useState<string | null>(
    resolveImageUrl(initialUser?.profile_image)
  );

  const handleLogin = (userData: User, token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    setToken(token);
    setUploadedImage(resolveImageUrl(userData.profile_image));
  };

  const roles: string[] = user?.roles
    ? user.roles.map(r => r.name)
    : user?.role_type
      ? [user.role_type]
      : [];

  const handleLogout = () => {
    if (user?.id) disconnectSocket(user.id);
    localStorage.clear();
    setUser(null);
    setToken(null);
    setUploadedImage(null);
    // navigate('/login');
    window.location.href = '/login';
  };

  const updateUser = (newUserData: User) => {
    localStorage.setItem('user', JSON.stringify(newUserData));
    setUser(newUserData);
    // Only touch the avatar when the update actually carries a profile image.
    // Partial updates (e.g. company_info flag) must not blank out the
    // currently displayed image just because they don't include this field.
    if (newUserData.profile_image) {
      setUploadedImage(resolveImageUrl(newUserData.profile_image));
    }
  };

  const hasRole = (role: string) => {
    return roles.includes(role);
  };
  const isSuperAdmin = roles.includes('super_admin');
  const isAdmin = roles.includes('admin');

  const permissions: string[] = user?.roles
    ? user.roles.flatMap(r => (r.permissions || []).map(p => p.name))
    : [];

  const hasPermission = (permission: string) => {
    return permissions.includes(permission);
  };

  return (
    <UserContext.Provider
      value={{
        user,
        token,
        handleLogin,
        handleLogout,
        updateUser,
        hasRole,
        isSuperAdmin,
        isAdmin,

        permissions,
        hasPermission,
        isLoggedIn: !!user,
        uploadedImage,
        setUploadedImage,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext) as UserContextValue;

export const hardLogout = () => {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (user) disconnectSocket(user?.id);
  localStorage.clear();
  window.location.href = '/login';
};
