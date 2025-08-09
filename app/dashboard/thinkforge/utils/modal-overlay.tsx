
export const ModalOverlay: React.FC<{children: React.ReactNode }> = ({ children }) => {
    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
            {/* Glassy dark overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-zinc-900/60 to-black/70 backdrop-blur-sm"></div>
            {/* Glassmorphism modal */}
            {children}
        </div>
    );
};
