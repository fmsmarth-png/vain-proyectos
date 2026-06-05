import { useEffect } from 'react';
import { App } from '@capacitor/app';

const useAppFocus = (callback: () => void) => {
  useEffect(() => {
    let listener: any;

    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) callback();
    }).then(l => { listener = l; });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') callback();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (listener) listener.remove();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
};

export default useAppFocus;