import { useState, useEffect, useCallback } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
  isConnecting: boolean;
  connectionType: string | null;
  lastOnlineTime: number | null;
  lastOfflineTime: number | null;
}

export interface ConnectionQuality {
  rtt: number; // Round trip time in ms
  downlink: number; // Download speed in Mbps
  effectiveType: string; // 'slow-2g', '2g', '3g', '4g'
  saveData: boolean; // User has data saver enabled
}

// Type for Network Information API
interface NetworkConnection {
  effectiveType?: string;
  type?: string;
  rtt?: number;
  downlink?: number;
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkConnection;
  mozConnection?: NetworkConnection;
  webkitConnection?: NetworkConnection;
}

/**
 * Hook for monitoring network connectivity status
 */
export const useNetworkStatus = () => {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    isConnecting: false,
    connectionType: null,
    lastOnlineTime: navigator.onLine ? Date.now() : null,
    lastOfflineTime: !navigator.onLine ? Date.now() : null
  });

  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality | null>(null);

  // Update network status
  const updateNetworkStatus = useCallback((isOnline: boolean) => {
    setNetworkStatus(prev => ({
      ...prev,
      isOnline,
      isConnecting: false,
      lastOnlineTime: isOnline ? Date.now() : prev.lastOnlineTime,
      lastOfflineTime: !isOnline ? Date.now() : prev.lastOfflineTime
    }));
  }, []);

  // Get connection info if available
  const updateConnectionInfo = useCallback(() => {
    const nav = navigator as NavigatorWithConnection;
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
    
    if (connection) {
      setNetworkStatus(prev => ({
        ...prev,
        connectionType: connection.effectiveType || connection.type || null
      }));

      setConnectionQuality({
        rtt: connection.rtt || 0,
        downlink: connection.downlink || 0,
        effectiveType: connection.effectiveType || 'unknown',
        saveData: connection.saveData || false
      });
    }
  }, []);

  // Test connectivity by making a small request
  const testConnectivity = useCallback(async (): Promise<boolean> => {
    try {
      setNetworkStatus(prev => ({ ...prev, isConnecting: true }));
      
      // Use a small request to test connectivity
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch('/favicon.ico', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const isConnected = response.ok;
      updateNetworkStatus(isConnected);
      return isConnected;
    } catch {
      updateNetworkStatus(false);
      return false;
    }
  }, [updateNetworkStatus]);

  // Set up event listeners
  useEffect(() => {
    const handleOnline = () => {
      console.log('Network: Online detected');
      updateNetworkStatus(true);
      updateConnectionInfo();
    };

    const handleOffline = () => {
      console.log('Network: Offline detected');
      updateNetworkStatus(false);
    };

    const handleConnectionChange = () => {
      console.log('Network: Connection changed');
      updateConnectionInfo();
      
      // Re-test connectivity when connection changes
      if (navigator.onLine) {
        testConnectivity();
      }
    };

    // Listen for online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for connection changes (if supported)
    const nav = navigator as NavigatorWithConnection;
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
    
    if (connection && connection.addEventListener) {
      connection.addEventListener('change', handleConnectionChange);
    }

    // Initial connection info update
    updateConnectionInfo();

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      
      if (connection && connection.removeEventListener) {
        connection.removeEventListener('change', handleConnectionChange);
      }
    };
  }, [updateNetworkStatus, updateConnectionInfo, testConnectivity]);

  // Periodic connectivity check
  useEffect(() => {
    const interval = setInterval(() => {
      // Only test if we think we're online but haven't verified recently
      if (navigator.onLine && networkStatus.lastOnlineTime && 
          Date.now() - networkStatus.lastOnlineTime > 30000) { // 30 seconds
        testConnectivity();
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [networkStatus.lastOnlineTime, testConnectivity]);

  return {
    ...networkStatus,
    connectionQuality,
    testConnectivity,
    isSlowConnection: connectionQuality?.effectiveType === 'slow-2g' || 
                     connectionQuality?.effectiveType === '2g',
    isFastConnection: connectionQuality?.effectiveType === '4g',
    hasDataSaver: connectionQuality?.saveData || false
  };
};

/**
 * Hook for handling network-dependent operations
 */
export const useNetworkAwareOperation = () => {
  const networkStatus = useNetworkStatus();

  const executeWhenOnline = async (
    operation: () => Promise<void>,
    options: {
      retryCount?: number;
      retryDelay?: number;
      skipIfOffline?: boolean;
    } = {}
  ): Promise<boolean> => {
    const { retryCount = 3, retryDelay = 1000, skipIfOffline = false } = options;

    if (!networkStatus.isOnline) {
      if (skipIfOffline) {
        console.log('Operation skipped: Currently offline');
        return false;
      }
      
      // Wait for network to come back online
      await new Promise<void>((resolve) => {
        const checkNetwork = () => {
          if (networkStatus.isOnline) {
            resolve();
          } else {
            setTimeout(checkNetwork, 1000);
          }
        };
        checkNetwork();
      });
    }

    // Execute operation with retry logic
    for (let attempt = 0; attempt < retryCount; attempt++) {
      try {
        await operation();
        return true;
      } catch (error) {
        console.error(`Operation attempt ${attempt + 1} failed:`, error);
        
        if (attempt < retryCount - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
        }
      }
    }

    return false;
  };

  return {
    networkStatus,
    executeWhenOnline
  };
};

export default useNetworkStatus;
