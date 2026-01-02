import { useState } from 'react';
import { CheckCircleIcon, ExclamationCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';

interface Toast {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  details?: string;
}

interface ToastNotificationProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export function ToastNotification({ toasts, onDismiss }: ToastNotificationProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 p-4 rounded-lg shadow-lg border ${
            toast.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : toast.type === 'error'
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              : toast.type === 'warning'
              ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
              : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
          }`}
        >
          <div className="flex-shrink-0 mt-0.5">
            {toast.type === 'success' && (
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            )}
            {toast.type === 'error' && (
              <XCircleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
            )}
            {toast.type === 'warning' && (
              <ExclamationCircleIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            )}
            {toast.type === 'info' && (
              <ExclamationCircleIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${
              toast.type === 'success'
                ? 'text-green-900 dark:text-green-100'
                : toast.type === 'error'
                ? 'text-red-900 dark:text-red-100'
                : toast.type === 'warning'
                ? 'text-yellow-900 dark:text-yellow-100'
                : 'text-blue-900 dark:text-blue-100'
            }`}>
              {toast.message}
            </p>
            {toast.details && (
              <p className={`mt-1 text-xs ${
                toast.type === 'success'
                  ? 'text-green-700 dark:text-green-300'
                  : toast.type === 'error'
                  ? 'text-red-700 dark:text-red-300'
                  : toast.type === 'warning'
                  ? 'text-yellow-700 dark:text-yellow-300'
                  : 'text-blue-700 dark:text-blue-300'
              }`}>
                {toast.details}
              </p>
            )}
          </div>
          
          <button
            onClick={() => onDismiss(toast.id)}
            className={`flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200`}
          >
            <XCircleIcon className="h-5 w-5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: Toast['type'], message: string, details?: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message, details }]);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return {
    toasts,
    addToast,
    dismissToast,
    success: (message: string, details?: string) => addToast('success', message, details),
    error: (message: string, details?: string) => addToast('error', message, details),
    warning: (message: string, details?: string) => addToast('warning', message, details),
    info: (message: string, details?: string) => addToast('info', message, details),
  };
}
