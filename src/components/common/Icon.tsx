import React from 'react';

export type IconName = 
  | 'microphone'
  | 'settings'
  | 'add'
  | 'share'
  | 'delete'
  | 'play'
  | 'pause'
  | 'stop'
  | 'download'
  | 'fullscreen'
  | 'minimize'
  | 'refresh'
  | 'check'
  | 'close'
  | 'menu'
  | 'diagram'
  | 'audio'
  | 'text'
  | 'upload'
  | 'info'
  | 'warning'
  | 'error'
  | 'success'
  | 'file-image'
  | 'file-code'
  | 'chevron-right'
  | 'chevron-down'
  | 'message-circle'
  | 'x'
  | 'mic'
  | 'image'
  | 'send';

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  color?: string;
}

const iconPaths: Record<IconName, string> = {
  microphone: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8',
  settings: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6z',
  add: 'M12 5v14M5 12h14',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  delete: 'M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
  play: 'M5 3l14 9-14 9V3z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  stop: 'M5 5h14v14H5z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  fullscreen: 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3',
  minimize: 'M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3m8-5a2 2 0 0 1 2 2v3',
  refresh: 'M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15',
  check: 'M20 6L9 17l-5-5',
  close: 'M18 6L6 18M6 6l12 12',
  menu: 'M3 12h18M3 6h18M3 18h18',
  diagram: 'M21 16V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM12 12v4M8 12v4M16 8v8',
  audio: 'M9 18V5l12-2v13M9 13l12-2',
  text: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  info: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zM12 9v4M12 17h.01',
  warning: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  error: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zM15 9l-6 6M9 9l6 6',
  success: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zM9 12l2 2 4-4',
  'file-image': 'M12 3v12m0 0l-4-4m4 4l4-4M4 17h16v4H4z',
  'file-code': 'M12 3v12m0 0l-4-4m4 4l4-4M4 17h16v4H4z',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-down': 'M6 9l6 6 6-6',
  'message-circle': 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  x: 'M18 6L6 18M6 6l12 12',
  mic: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2',
  image: 'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM21 15l-5-5L5 21',
  send: 'M2 21l21-9L2 3v7l15 2-15 2v7z'
};

export const Icon: React.FC<IconProps> = ({ 
  name, 
  size = 24, 
  className = '', 
  color = 'currentColor' 
}) => {
  const path = iconPaths[name];
  
  if (!path) {
    console.warn(`Icon "${name}" not found`);
    return null;
  }

  // Special handling for download icons with text labels
  if (name === 'file-image') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={`icon icon-${name} ${className}`}
      >
        <path 
          d="M12 3v12m0 0l-4-4m4 4l4-4" 
          stroke={color} 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        />
        <rect 
          x="4" 
          y="17" 
          width="16" 
          height="4" 
          rx="1" 
          fill={color}
        />
        <text 
          x="6" 
          y="20" 
          fontSize="3" 
          fill="white"
          fontFamily="Inter, system-ui, sans-serif"
          fontWeight="600"
        >
          PNG
        </text>
      </svg>
    );
  }

  if (name === 'file-code') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={`icon icon-${name} ${className}`}
      >
        <path 
          d="M12 3v12m0 0l-4-4m4 4l4-4" 
          stroke={color} 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        />
        <rect 
          x="4" 
          y="17" 
          width="16" 
          height="4" 
          rx="1" 
          fill={color}
        />
        <text 
          x="6.5" 
          y="20" 
          fontSize="3" 
          fill="white"
          fontFamily="Inter, system-ui, sans-serif"
          fontWeight="600"
        >
          SVG
        </text>
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon icon-${name} ${className}`}
    >
      <path d={path} />
    </svg>
  );
};

export default Icon;
