
import React, { ButtonHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, InputHTMLAttributes, forwardRef, useRef, useEffect } from 'react';

// GlassCard Component
interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}
export const GlassCard: React.FC<GlassCardProps> = ({ children, className, ...props }) => {
  return (
    <div className={`glass-card rounded-2xl p-6 ${className}`} {...props}>
      {children}
    </div>
  );
};

// Button Component
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: React.ReactNode;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, className, variant = 'primary', ...props }, ref) => {
    const baseClasses = 'px-4 py-2 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:ring-indigo-500';
    
    const variantClasses = {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-500',
      secondary: 'bg-gray-500/20 text-slate-900 dark:text-white hover:bg-gray-500/30',
      ghost: 'bg-transparent text-gray-500 dark:text-gray-300 hover:bg-gray-500/10 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white',
    };

    return (
      <button ref={ref} className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

// Input Component
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}
export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`w-full bg-slate-200/50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg p-3 text-slate-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow ${className}`}
      {...props}
    />
  )
});
Input.displayName = 'Input';


// Select Component
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode;
}
export const Select: React.FC<SelectProps> = ({ children, className, ...props }) => {
  return (
    <select
      className={`bg-slate-200/50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg px-3 py-2 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
};

// Textarea Component
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
    return (
        <textarea
            ref={ref}
            className={`w-full bg-slate-200/50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg p-3 text-slate-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none transition-shadow ${className}`}
            {...props}
        />
    );
});
Textarea.displayName = 'Textarea';

// Spinner Component
export const Spinner: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <svg
      className={`animate-spin h-5 w-5 text-slate-800 dark:text-white ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
};

// Modal Component
interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" aria-modal="true" role="dialog">
      <div className="relative w-full max-w-md">
        {children}
      </div>
    </div>
  )
}

// Popover Component
interface PopoverProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  triggerRef: React.RefObject<HTMLElement>;
}
export const Popover: React.FC<PopoverProps> = ({ isOpen, onClose, children, triggerRef }) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return (
    <div ref={popoverRef} className="absolute bottom-full mb-2 w-72">
      <GlassCard className="p-2">
        {children}
      </GlassCard>
    </div>
  );
};

// ToggleSwitch Component
interface ToggleSwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
}
export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, label }) => {
    return (
        <label htmlFor={label} className="flex items-center cursor-pointer">
            <div className="relative">
                <input id={label} type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
                <div className={`block w-10 h-6 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-gray-600'}`}></div>
                <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${checked ? 'translate-x-4' : ''}`}></div>
            </div>
            <div className="ml-3 text-gray-700 dark:text-gray-300 font-medium text-sm">{label}</div>
        </label>
    );
};
