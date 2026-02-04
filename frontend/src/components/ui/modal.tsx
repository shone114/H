import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    className?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div
                className={cn(
                    "relative w-full max-w-lg rounded-lg bg-background p-6 shadow-lg animate-in zoom-in-95 duration-200",
                    className
                )}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">{title}</h3>
                    <button onClick={onClose} className="rounded-full p-1 hover:bg-muted transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>
                <div>{children}</div>
            </div>
        </div>
    );
};
