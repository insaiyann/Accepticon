import React from 'react';
import { FiletypeSvg, FiletypePng } from 'react-bootstrap-icons';

/**
 * Demo component to showcase the new download icons
 * This can be used for testing or as a reference
 */
export const DownloadIconsDemo: React.FC = () => {
  const handleSVGDownload = () => {
    console.log('SVG download clicked');
  };

  const handlePNGDownload = () => {
    console.log('PNG download clicked');
  };

  return (
    <div style={{ 
      padding: '20px', 
      display: 'flex', 
      gap: '16px', 
      alignItems: 'center',
      background: '#f8f9fa',
      borderRadius: '8px',
      margin: '16px'
    }}>
      <h3 style={{ margin: 0, color: '#333' }}>Download Icons Demo:</h3>
      
      <button
        onClick={handleSVGDownload}
        style={{
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: '6px',
          padding: '8px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
        title="Download SVG"
      >
        <FiletypeSvg size={16} style={{ color: '#2563eb' }} />
        <span style={{ fontSize: '14px' }}>SVG</span>
      </button>
      
      <button
        onClick={handlePNGDownload}
        style={{
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: '6px',
          padding: '8px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
        title="Download PNG"
      >
        <FiletypePng size={16} style={{ color: '#059669' }} />
        <span style={{ fontSize: '14px' }}>PNG</span>
      </button>
    </div>
  );
};

export default DownloadIconsDemo;
