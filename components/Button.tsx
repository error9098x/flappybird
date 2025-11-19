import React from 'react';

interface ButtonProps {
  onClick: () => void;
  label: string;
  primary?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ onClick, label, primary = true }) => {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation(); // Prevent click from passing to canvas
        onClick();
      }}
      className={`
        pointer-events-auto
        relative px-8 py-3 rounded-full font-black text-xl uppercase tracking-widest transition-all duration-150 transform hover:-translate-y-1 active:translate-y-0
        ${primary 
          ? 'bg-green-500 text-white shadow-[0_6px_0_#15803d] hover:shadow-[0_8px_0_#15803d] active:shadow-[0_0_0_#15803d] hover:bg-green-400' 
          : 'bg-sky-500 text-white shadow-[0_6px_0_#0369a1] hover:shadow-[0_8px_0_#0369a1] active:shadow-[0_0_0_#0369a1] hover:bg-sky-400'
        }
      `}
    >
      {label}
    </button>
  );
};