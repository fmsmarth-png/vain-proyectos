import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cl.vain.proyectos',
  appName: 'VAIN Proyectos',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#0a1628',
      showSpinner: false,
    }
  }
};

export default config;