'use client';

import { createContext, useContext, ReactNode, useMemo } from 'react';
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from 'next-themes';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggle: () => {},
});

export const useTheme = () => useContext(ThemeContext);

const ThemeBridge = ({ children }: { children: ReactNode }) => {
  const { resolvedTheme, setTheme } = useNextTheme();

  const theme: Theme = resolvedTheme === 'dark' ? 'dark' : 'light';

  const value = useMemo<ThemeContextType>(
    () => ({
      theme,
      toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    }),
    [theme, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
    >
      <ThemeBridge>{children}</ThemeBridge>
    </NextThemesProvider>
  );
};
