"use client";

import React, { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ImageUploadProps {
  onFileChange: (files: File[]) => void;
 isLoading: boolean;
 multiple?: boolean;
}

const dropzoneVariants = {
  initial: { opacity: 0.8, scale: 0.98 },
  hover: { opacity: 1, scale: 1, transition: { duration: 0.2 } },
  active: { scale: 0.95, transition: { duration: 0.1 } },
};

import { Variants } from 'framer-motion';

const filePreviewVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2, ease: "easeIn" } },
};

export function ImageUpload({ onFileChange, isLoading, multiple = false }: ImageUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const { toast } = useToast();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      // If not multiple, only take the first file
      const filesToProcess = multiple ? acceptedFiles : [acceptedFiles[0]];
      
      // Check file sizes
      for (const file of filesToProcess) {
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
          toast({
            title: "File too large",
            description: "Please upload an image smaller than 5MB.",
            variant: "destructive",
          });
          return;
        }
      }
      
      setFiles(filesToProcess);
      onFileChange(filesToProcess);
      
      // Generate previews
      const newPreviews: (string | null)[] = new Array(filesToProcess.length).fill(null);
      filesToProcess.forEach((file, fileIndex) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          newPreviews[fileIndex] = reader.result as string;
          if (newPreviews.every(preview => preview !== null)) {
            setPreviews(newPreviews as string[]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  }, [onFileChange, toast, multiple]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.gif', '.webp'] },
    multiple: multiple,
    disabled: isLoading,
  });

  const removeFile = (e: React.MouseEvent, index?: number) => {
    e.stopPropagation();
    if (index !== undefined) {
      // Remove specific file
      const newFiles = [...files];
      const newPreviews = [...previews];
      newFiles.splice(index, 1);
      newPreviews.splice(index, 1);
      setFiles(newFiles);
      setPreviews(newPreviews);
      onFileChange(newFiles);
    } else {
      // Remove all files
      setFiles([]);
      setPreviews([]);
      onFileChange([]);
    }
  };

  const dropzoneStateStyles = useMemo(() => {
    if (isDragActive) return "border-purple-500 bg-purple-950/30";
    if (isLoading) return "border-zinc-700 bg-zinc-900/20 cursor-not-allowed";
    return "border-zinc-800/70 hover:border-purple-600/70 bg-zinc-950/40";
  }, [isDragActive, isLoading]);

  return (
    <div className="w-full">
      <motion.div
        className={`relative rounded-lg border border-dashed text-center transition-all duration-300 cursor-pointer group ${dropzoneStateStyles}`}
        variants={dropzoneVariants}
        whileHover="hover"
      >
        <div {...getRootProps()} className="p-4">
          <input {...getInputProps()} />
          <AnimatePresence>
          {previews.length > 0 ? (
            <div className="flex flex-wrap gap-2 justify-center">
              {previews.map((preview, index) => (
                <motion.div
                  key={index}
                  variants={filePreviewVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="relative"
                >
                  <img src={preview} alt={`Preview ${index + 1}`} className="w-12 h-12 rounded object-cover" />
                  <button
                    onClick={(e) => removeFile(e, index)}
                    className="absolute -top-1 -right-1 bg-zinc-800 rounded-full p-0.5 text-zinc-400 hover:text-white hover:bg-red-500/80 transition-all"
                    aria-label="Remove image"
                    disabled={isLoading}
                  >
                    <X size={12} />
                  </button>
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div
              key="placeholder"
              variants={filePreviewVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col items-center justify-center text-zinc-400"
            >
              <div className="relative mb-2">
                <div className="absolute inset-0 rounded-full bg-purple-500/20 blur-lg scale-90 opacity-60 transition-all duration-300 group-hover:opacity-80 group-hover:scale-100"></div>
                <ImageIcon className="h-8 w-8 text-purple-400/80 relative z-10 transition-colors duration-300 group-hover:text-purple-400" />
              </div>
              <p className="text-sm font-medium text-zinc-300 mb-1">
                {isDragActive ? "Drop here..." : "Upload Images"}
              </p>
              <p className="text-[11px] text-zinc-500 leading-tight">Drag & drop or click to upload</p>
              <p className="text-[11px] text-zinc-600 mt-1">Max 5MB per image</p>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}