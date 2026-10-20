import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 z-50 flex items-center gap-2.5 rounded-xl bg-amber-600 px-4 py-3 text-xs font-medium text-white shadow-xl backdrop-blur-md animate-fade-in border border-amber-500">
      <WifiOff className="w-4 h-4 shrink-0 animate-pulse" />
      <span>وضع عدم الاتصال — التعديل يتطلب اتصالاً نشطاً بالإنترنت لحماية الشجرة من التعارض.</span>
    </div>
  );
};
