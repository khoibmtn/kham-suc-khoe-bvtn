'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
};

type ToastContextValue = {
  showToast: (
    message: string,
    kind?: ToastKind,
    action?: ToastAction,
  ) => void;
};

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

let nextToastId = 1;

export const TOAST_DURATION_MS = 4000;
export const TOAST_ACTION_DURATION_MS = 12000;

const KIND_PREFIX: Record<ToastKind, string> = {
  info: 'Thông báo',
  success: 'Thành công',
  warning: 'Cảnh báo',
  error: 'Lỗi',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'info', action?: ToastAction) => {
      const id = nextToastId++;
      setToasts((prev) => [...prev.slice(-4), { id, kind, message, action }]);
      window.setTimeout(
        () => {
          removeToast(id);
        },
        action ? TOAST_ACTION_DURATION_MS : TOAST_DURATION_MS,
      );
    },
    [removeToast],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-region" aria-live="polite" aria-atomic="false">
          {toasts.map((item) => (
            <div
              key={item.id}
              role={item.kind === 'error' ? 'alert' : 'status'}
              className={`toast-item toast-${item.kind}`}
            >
              <div className="toast-content">
                <strong className="toast-prefix">{KIND_PREFIX[item.kind]}:</strong>{' '}
                <span>{item.message}</span>
                {item.action && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs toast-action-btn"
                    onClick={() => {
                      removeToast(item.id);
                      item.action?.onClick();
                    }}
                  >
                    {item.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                className="toast-close"
                onClick={() => removeToast(item.id)}
                aria-label="Đóng thông báo"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
