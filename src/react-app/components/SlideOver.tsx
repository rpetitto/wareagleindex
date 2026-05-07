import { useEffect } from "react";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function SlideOver({ open, onClose, children }: SlideOverProps) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-warm h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="sticky top-0 z-10 bg-warm/95 backdrop-blur border-b border-gray-100 px-4 py-3 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Close
          </button>
        </div>
        <div className="flex-1 px-4 py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
