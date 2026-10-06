import React from 'react';
import { HardDrive, Upload, CheckCircle, Info, X, Sparkles, AlertCircle } from 'lucide-react';
import { isLocalFontAccessSupported } from '../utils/font-manager';

interface ComputerFontModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSystemFonts: () => void;
  onUploadFontFile: () => void;
  isScanning: boolean;
  localFontCount: number;
}

export const ComputerFontModal: React.FC<ComputerFontModalProps> = ({
  isOpen,
  onClose,
  onScanSystemFonts,
  onUploadFontFile,
  isScanning,
  localFontCount,
}) => {
  if (!isOpen) return null;

  const hasApiSupport = isLocalFontAccessSupported();

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md">
              <HardDrive size={20} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Access Computer Fonts</h3>
              <p className="text-xs text-blue-100">Use any font installed on your PC or Mac</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-sm text-slate-600">
          <p className="text-slate-700 leading-relaxed">
            Yes! This applet can access your local computer fonts in two easy ways:
          </p>

          {/* Option 1: Direct System Access */}
          <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/50 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-600 text-white shrink-0 mt-0.5">
                <HardDrive size={18} />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  1. Scan Installed Computer Fonts
                  {hasApiSupport ? (
                    <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                      Supported in this browser
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      Requires Chrome/Edge
                    </span>
                  )}
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Uses the standard <span className="font-mono text-slate-800 font-semibold">Local Font Access API</span> to browse all fonts installed on your Windows or Mac system (Arial, Helvetica, Segoe UI, custom OTF/TTF, etc.).
                </p>
              </div>
            </div>

            <button
              onClick={onScanSystemFonts}
              disabled={isScanning || !hasApiSupport}
              className={`w-full py-2.5 px-4 rounded-lg font-semibold text-xs transition flex items-center justify-center gap-2 shadow-sm ${
                hasApiSupport
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isScanning ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Scanning computer fonts...
                </>
              ) : localFontCount > 0 ? (
                <>
                  <CheckCircle size={15} className="text-emerald-300" />
                  {localFontCount} Computer Fonts Loaded (Click to Rescan)
                </>
              ) : (
                <>
                  <HardDrive size={15} />
                  Scan Computer Fonts Now
                </>
              )}
            </button>
          </div>

          {/* Option 2: Upload Font File */}
          <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/50 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-600 text-white shrink-0 mt-0.5">
                <Upload size={18} />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  2. Load Any Font File From Disk
                  <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                    100% Cross-Browser
                  </span>
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Works on all browsers (Chrome, Safari, Firefox, Edge). Pick any <span className="font-semibold text-slate-800">.ttf</span>, <span className="font-semibold text-slate-800">.otf</span>, or <span className="font-semibold text-slate-800">.woff</span> file from your computer (e.g. from <span className="font-mono text-xs">C:\Windows\Fonts</span> or <span className="font-mono text-xs">/Library/Fonts</span>).
                </p>
              </div>
            </div>

            <button
              onClick={onUploadFontFile}
              className="w-full py-2.5 px-4 rounded-lg font-semibold text-xs bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center justify-center gap-2 shadow-sm"
            >
              <Upload size={15} />
              Choose Font File From Computer (.ttf, .otf, .woff)
            </button>
          </div>

          {/* Outlining Bonus Note */}
          <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <Sparkles size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <p>
              <strong>Vector Outlines:</strong> Any local or uploaded font can be converted into raw vector paths with <strong className="text-slate-800">Create Outlines</strong> (Ctrl+Shift+O), letting you edit anchor nodes, apply brushes, and use Pathfinder boolean tools!
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
