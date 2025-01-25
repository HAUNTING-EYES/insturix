"use client";

import { memo, useEffect, useState } from "react";

interface TypingAnimationProps {
    messages: string[];
    textClass?: string;
    parentClass?: string;
    displayDuration?: number;
    characterDelay?: number;
    transitionDuration?: number;
    shouldLoop?: boolean;
    onComplete?: () => void;
}

const AnimatedText = memo(({ text, isVisible }: { text: string; isVisible: boolean }) => (
    <span
        className={`absolute inset-0 transition-opacity duration-500 ${isVisible ? "opacity-100" : "opacity-0"
            }`}
        style={{ transitionTimingFunction: "ease-out" }}
    >
        {text}
    </span>
));
AnimatedText.displayName = "AnimatedText";

export default function SimpleTypingAnimation({
    messages,
    textClass = "",
    parentClass = "",
    displayDuration = 3000,
    transitionDuration = 500, // Adjusted to match animation duration
    shouldLoop = true,
    onComplete = () => { },
}: TypingAnimationProps) {
    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
    const [isCurrentVisible, setIsCurrentVisible] = useState(true);
    const [isTypingComplete, setIsTypingComplete] = useState(false);

    useEffect(() => {
        if (isTypingComplete && !shouldLoop) return;

        const transitionTimeout = setTimeout(() => {
            setIsCurrentVisible(false); // Fade out current text
            setTimeout(() => {
                setCurrentMessageIndex((prev) => {
                    const nextIndex = prev === messages.length - 1 ? 0 : prev + 1;
                    if (nextIndex === 0 && !shouldLoop) {
                        setIsTypingComplete(true);
                        onComplete?.();
                        return prev;
                    } else {
                        setIsCurrentVisible(true); // Fade in next text
                        return nextIndex;
                    }
                });
            }, transitionDuration); // Wait for fade out, then change text and fade in
        }, displayDuration);

        return () => clearTimeout(transitionTimeout);
    }, [
        currentMessageIndex,
        displayDuration,
        transitionDuration,
        messages.length,
        shouldLoop,
        isTypingComplete,
        onComplete,
    ]);

    return (
        <div className={`relative flex items-center justify-center ${parentClass}`}>
            <div
                className={`relative ${textClass}`}
                style={{
                    lineHeight: 1.2,
                    maxWidth: "100%",
                    minHeight: "1.2em",
                    height: "auto",
                }}
            >
                <AnimatedText
                    text={messages[currentMessageIndex]}
                    isVisible={isCurrentVisible}
                />
            </div>
        </div>
    );
}