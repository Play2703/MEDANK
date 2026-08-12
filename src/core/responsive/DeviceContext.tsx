import React, { createContext, useContext, useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { M3ColorScheme, lightColorScheme, darkColorScheme, ThemeMode } from '../theme/material3';

export type DeviceMode = 'fluid' | 'iphone' | 'ipad';

interface DeviceContextType {
  deviceMode: DeviceMode;
  setDeviceMode: (mode: DeviceMode) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  isDark: boolean;
  colors: M3ColorScheme;
  isMobileViewport: boolean;
  isTabletViewport: boolean;
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export const DeviceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isNative = Capacitor.isNativePlatform();
  const [deviceModeState, setDeviceModeState] = useState<DeviceMode>('fluid');

  const deviceMode = isNative ? 'fluid' : deviceModeState;
  const setDeviceMode = (mode: DeviceMode) => {
    if (!isNative) {
      setDeviceModeState(mode);
    }
  };

  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isDark = themeMode === 'dark';
  const colors = isDark ? darkColorScheme : lightColorScheme;

  const isMobileViewport = deviceMode === 'iphone' || (deviceMode === 'fluid' && windowWidth < 768);
  const isTabletViewport = deviceMode === 'ipad' || (deviceMode === 'fluid' && windowWidth >= 768 && windowWidth < 1024);

  return (
    <DeviceContext.Provider
      value={{
        deviceMode,
        setDeviceMode,
        themeMode,
        setThemeMode,
        isDark,
        colors,
        isMobileViewport,
        isTabletViewport,
      }}
    >
      <div
        className={isDark ? 'dark' : ''}
        style={{
          backgroundColor: colors.background,
          color: colors.onBackground,
          minHeight: '100vh',
          fontFamily: 'Roboto, system-ui, sans-serif',
        }}
      >
        {children}
      </div>
    </DeviceContext.Provider>
  );
};

export const useDevice = (): DeviceContextType => {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error('useDevice must be used within a DeviceProvider');
  }
  return context;
};
