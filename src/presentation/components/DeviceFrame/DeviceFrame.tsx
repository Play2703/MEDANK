import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDevice } from '../../../core/responsive/DeviceContext';
import { Smartphone, Tablet } from 'lucide-react';

interface DeviceFrameProps {
  children: React.ReactNode;
}

const FrameIFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isDark, colors } = useDevice();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html class="${isDark ? 'dark' : ''}">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              overflow-x: hidden;
              background-color: ${colors.background};
              color: ${colors.onBackground};
              font-family: Roboto, system-ui, sans-serif;
            }
          </style>
        </head>
        <body class="${isDark ? 'dark' : ''}">
          <div id="frame-root" class="${isDark ? 'dark' : ''}" style="min-height: 100%; display: flex; flex-direction: column; color: ${colors.onBackground};"></div>
        </body>
      </html>
    `);
    doc.close();

    const syncStyles = () => {
      if (!doc.head) return;
      // Clear previous styles cloned by frame
      const existing = doc.head.querySelectorAll('[data-frame-style]');
      existing.forEach((el) => el.remove());

      document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
        const clone = node.cloneNode(true) as HTMLElement;
        clone.setAttribute('data-frame-style', 'true');
        doc.head.appendChild(clone);
      });
    };

    syncStyles();

    const observer = new MutationObserver(() => {
      syncStyles();
    });
    observer.observe(document.head, { childList: true, subtree: true });

    setMountNode(doc.getElementById('frame-root'));

    return () => {
      observer.disconnect();
    };
  }, []);

  // Dynamically update dark class and text colors inside iframe when theme toggles
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;
    const doc = iframe.contentDocument;
    if (doc.documentElement) {
      doc.documentElement.className = isDark ? 'dark' : '';
    }
    if (doc.body) {
      doc.body.className = isDark ? 'dark' : '';
      doc.body.style.backgroundColor = colors.background;
      doc.body.style.color = colors.onBackground;
    }
    const root = doc.getElementById('frame-root');
    if (root) {
      root.className = isDark ? 'dark' : '';
      root.style.color = colors.onBackground;
    }
  }, [isDark, colors]);

  return (
    <iframe
      ref={iframeRef}
      className="w-full h-full border-0 bg-transparent"
      title="Emulated Screen Frame"
    >
      {mountNode ? createPortal(children, mountNode) : null}
    </iframe>
  );
};

export const DeviceFrame: React.FC<DeviceFrameProps> = ({ children }) => {
  const { deviceMode, colors, setDeviceMode } = useDevice();

  if (deviceMode === 'fluid') {
    return <div className="w-full min-h-screen">{children}</div>;
  }

  if (deviceMode === 'iphone') {
    return (
      <div className="py-6 px-4 flex flex-col items-center justify-center min-h-screen bg-neutral-900/50">
        <div className="text-xs font-bold text-neutral-400 mb-3 flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-cyan-400" />
          <span>Emulação iPhone 15 Pro (393px - Viewport Isolada)</span>
          <button
            onClick={() => setDeviceMode('fluid')}
            className="ml-2 underline text-cyan-400 hover:text-cyan-300"
          >
            Sair da Emulação
          </button>
        </div>

        {/* iPhone Outer Frame */}
        <div
          className="relative w-[393px] h-[830px] rounded-[52px] border-[10px] border-neutral-800 shadow-2xl overflow-hidden flex flex-col transition-all"
          style={{ backgroundColor: colors.background, color: colors.onBackground }}
        >
          {/* Dynamic Island / Notch */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full z-50 flex items-center justify-end px-3 pointer-events-none">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-900/60" />
          </div>

          {/* Screen Container with Isolated Iframe Viewport */}
          <div className="flex-1 overflow-hidden pt-6 relative">
            <FrameIFrame>{children}</FrameIFrame>
          </div>

          {/* iPhone Bottom Home Indicator */}
          <div className="w-full py-2 flex items-center justify-center shrink-0 z-50 pointer-events-none">
            <div className="w-32 h-1 bg-neutral-400 dark:bg-neutral-600 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (deviceMode === 'ipad') {
    return (
      <div className="py-6 px-4 flex flex-col items-center justify-center min-h-screen bg-neutral-900/50">
        <div className="text-xs font-bold text-neutral-400 mb-3 flex items-center gap-2">
          <Tablet className="w-4 h-4 text-cyan-400" />
          <span>Emulação iPad Air (820px - Viewport Isolada)</span>
          <button
            onClick={() => setDeviceMode('fluid')}
            className="ml-2 underline text-cyan-400 hover:text-cyan-300"
          >
            Sair da Emulação
          </button>
        </div>

        {/* iPad Outer Frame */}
        <div
          className="relative w-[820px] h-[1050px] rounded-[40px] border-[12px] border-neutral-800 shadow-2xl overflow-hidden flex flex-col transition-all"
          style={{ backgroundColor: colors.background, color: colors.onBackground }}
        >
          {/* Front Camera */}
          <div className="w-full py-2 flex justify-center z-50 pointer-events-none">
            <div className="w-3 h-3 rounded-full bg-neutral-800 border border-neutral-700" />
          </div>

          {/* iPad Screen Scrollable Container */}
          <div className="flex-1 overflow-hidden pb-4 relative">
            <FrameIFrame>{children}</FrameIFrame>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
