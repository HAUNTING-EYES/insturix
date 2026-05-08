'use client';

import { useContext, useState, ChangeEvent, useEffect, useRef, KeyboardEvent } from 'react';
import { SubmissionContext } from "./context/SubmissionContext";
    
export default function PromptBox() {
  const { submitted, setSubmitted, prompt, setPrompt } = useContext(SubmissionContext);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && prompt.trim() !== '') {
      e.preventDefault(); // prevent new line
      setSubmitted(true);
    }
  };

  const handleSubmit = () => {
    if (prompt.trim() !== '') {
      setSubmitted(true);
      // You can add your actual submit logic here
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);

  return (
    <div className="w-full flex justify-center items-center">

        {!submitted ? (
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="What's on your mind?"
            maxLength={500}
            className="fixed top-1/2 w-full max-w-md px-4 py-3 rounded-xl bg-black/60 text-[#D4A652] placeholder-gold focus:outline-none resize-none shadow-xl transition-all hover:scale-[1.2] min-h-[50px] max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-gold scrollbar-track-transparent"
            rows={1}
          />
        ) : (
          <textarea disabled
            ref={textareaRef}
            value={prompt}
            maxLength={500}
            className="w-full fixed top-1/30 max-w-4xl px-4 py-3 rounded-xl bg-black/60 text-[#D4A652] placeholder-gold focus:outline-none resize-none shadow-xl transition-all duration-500 hover:scale-[1.05] min-h-[50px] max-h-[100px] overflow-y-auto scrollbar-thin scrollbar-thumb-gold scrollbar-track-transparent"
            rows={1}
          />

        )}

      
    </div>
  );
}
