import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Icon } from '../common/Icon';
import './MermaidViewer.css';

interface MermaidViewerProps {
  mermaidCode?: string;
  title?: string;
  onError?: (error: string) => void;
  className?: string;
}

const MermaidViewer: React.FC<MermaidViewerProps> = ({
  mermaidCode,
  title,
  onError,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [svgElement, setSvgElement] = useState<SVGElement | null>(null);

  // Initialize mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: '"Inter", "system-ui", sans-serif',
      fontSize: 14,
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis'
      },
      sequence: {
        useMaxWidth: true,
        mirrorActors: true,
        showSequenceNumbers: false
      },
      gantt: {
        useMaxWidth: true
      }
    });
  }, []);

  // Render mermaid diagram
  useEffect(() => {
    if (!mermaidCode || !containerRef.current) {
      return;
    }

    const renderDiagram = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Validate mermaid syntax
        await mermaid.parse(mermaidCode);
        
        // Clear previous content
        containerRef.current!.innerHTML = '';
        
        // Generate unique ID for the diagram
        const diagramId = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Render the diagram
        const { svg } = await mermaid.render(diagramId, mermaidCode);
        
        // Insert the SVG into the container
        containerRef.current!.innerHTML = svg;
        
        // Store SVG element for fullscreen functionality
        const svgEl = containerRef.current!.querySelector('svg');
        setSvgElement(svgEl);

        // Add zoom functionality to the SVG
        if (svgEl) {
          addZoomFunctionality(svgEl);
        }

        console.log('Mermaid diagram rendered successfully');
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to render diagram';
        setError(errorMessage);
        onError?.(errorMessage);
        console.error('Mermaid rendering error:', error);
        
        // Show error in container
        containerRef.current!.innerHTML = `
          <div class="mermaid-error">
            <div class="error-icon">⚠️</div>
            <div class="error-title">Diagram Rendering Error</div>
            <div class="error-message">${errorMessage}</div>
          </div>
        `;
      } finally {
        setIsLoading(false);
      }
    };

    renderDiagram();
  }, [mermaidCode, onError]);

  // Add zoom and pan functionality to SVG
  const addZoomFunctionality = (svg: SVGElement) => {
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    const updateTransform = () => {
      svg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    };

    // Mouse wheel zoom
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      scale = Math.max(0.1, Math.min(5, scale * delta));
      updateTransform();
    });

    // Mouse drag pan
    svg.addEventListener('mousedown', (e) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      svg.style.cursor = 'grabbing';
    });

    svg.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - lastMouseX;
      const deltaY = e.clientY - lastMouseY;
      
      translateX += deltaX;
      translateY += deltaY;
      
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      
      updateTransform();
    });

    svg.addEventListener('mouseup', () => {
      isDragging = false;
      svg.style.cursor = 'grab';
    });

    svg.addEventListener('mouseleave', () => {
      isDragging = false;
      svg.style.cursor = 'grab';
    });

    // Set initial cursor
    svg.style.cursor = 'grab';
  };

  // Toggle fullscreen mode
  const toggleFullscreen = async () => {
    if (!isFullscreen) {
      try {
        // Enter fullscreen using the browser's Fullscreen API
        const element = containerRef.current?.closest('.mermaid-viewer') as HTMLElement;
        if (element && element.requestFullscreen) {
          await element.requestFullscreen();
          setIsFullscreen(true);
        } else {
          // Fallback to CSS-only fullscreen if Fullscreen API is not supported
          setIsFullscreen(true);
        }
      } catch (error) {
        console.warn('Fullscreen API not supported, using CSS fallback:', error);
        // Fallback to CSS-only fullscreen
        setIsFullscreen(true);
      }
    } else {
      try {
        // Exit fullscreen
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        } else {
          // Fallback for CSS-only fullscreen
          setIsFullscreen(false);
        }
      } catch (error) {
        console.warn('Error exiting fullscreen:', error);
        setIsFullscreen(false);
      }
    }
  };

  // Listen for fullscreen changes
  React.useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Reset zoom and pan
  const resetZoom = () => {
    if (svgElement) {
      svgElement.style.transform = 'translate(0px, 0px) scale(1)';
    }
  };

  // Download diagram as SVG
  const downloadSVG = () => {
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = `${title || 'diagram'}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    URL.revokeObjectURL(svgUrl);
  };

  // Download diagram as PNG
  const downloadPNG = () => {
    if (!svgElement) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob((blob) => {
        if (!blob) return;
        
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `${title || 'diagram'}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        URL.revokeObjectURL(url);
      });
    };
    
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    img.src = URL.createObjectURL(svgBlob);
  };

  return (
    <div className={`mermaid-viewer ${className} ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Header with title and controls */}
      <div className="mermaid-header">
        <div className="mermaid-title">
          {title || 'Diagram'}
        </div>
        
        <div className="mermaid-controls">
          <button
            className="control-button"
            onClick={resetZoom}
            title="Reset Zoom"
            disabled={!svgElement}
          >
            <Icon name="refresh" size={16} className="icon" />
          </button>
          
          <button
            className="control-button"
            onClick={downloadSVG}
            title="Download SVG"
            disabled={!svgElement}
          >
            <Icon name="download" size={16} className="icon" />
          </button>
          
          <button
            className="control-button"
            onClick={downloadPNG}
            title="Download PNG"
            disabled={!svgElement}
          >
            <Icon name="download" size={16} className="icon" />
          </button>
          
          <button
            className="control-button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            <Icon 
              name={isFullscreen ? 'minimize' : 'fullscreen'} 
              size={16} 
              className="icon" 
            />
          </button>
        </div>
      </div>

      {/* Diagram container */}
      <div className="mermaid-content">
        {isLoading && (
          <div className="mermaid-loading">
            <div className="loading-spinner"></div>
            <div>Rendering diagram...</div>
          </div>
        )}
        
        {!mermaidCode && !isLoading && (
          <div className="mermaid-placeholder">
            <div className="placeholder-icon">📊</div>
            <div className="placeholder-title">No Diagram</div>
            <div className="placeholder-message">
              Generate a diagram from your messages to see it here
            </div>
          </div>
        )}
        
        <div 
          ref={containerRef} 
          className="mermaid-diagram"
          style={{ 
            display: isLoading || (!mermaidCode && !error) ? 'none' : 'block' 
          }}
        />
      </div>

      {/* Instructions for zoom and pan */}
      {svgElement && !isFullscreen && (
        <div className="mermaid-instructions">
          <small>💡 Mouse wheel to zoom • Click and drag to pan</small>
        </div>
      )}
    </div>
  );
};

export default MermaidViewer;
