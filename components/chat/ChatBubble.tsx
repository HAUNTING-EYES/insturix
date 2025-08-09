import { motion } from "framer-motion";

// Reusable variants for entrance animation
const variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay: i * 0.08, type: "spring" as const, stiffness: 120 }
  })
};

export interface ChatBubbleProps {
  role: "user" | "ai";
  content: string;
  timestamp: Date | string | number;
}

export default function ChatBubble({ role, content, timestamp, index = 0 }: ChatBubbleProps & { index?: number }) {
  const isUser = role === "user";

  // Subtle accent colour & lighter visual weight
  const accentClass = isUser ? "bg-zinc-500" : "bg-red-500/80";

  // Safely format timestamp
  const formatTimestamp = (timestamp: Date | string | number): string => {
    try {
      let date: Date;
      
      if (timestamp instanceof Date) {
        date = timestamp;
      } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else if (typeof timestamp === 'number') {
        date = new Date(timestamp);
      } else {
        date = new Date();
      }
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'Just now';
      }
      
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      console.warn('Failed to format timestamp:', timestamp, error);
      return 'Just now';
    }
  };

  // Accent bar element placed conditionally
  const AccentBar = () => (
    <div className={`w-[3px] ${isUser ? 'rounded-l-sm' : 'rounded-r-sm'} ${accentClass}`} />
  );

  // User messages have subtle background; AI responses are transparent for a cleaner look
  const bubbleBg = isUser ? "bg-zinc-700 text-zinc-100" : "bg-transparent text-zinc-100";

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      custom={index}
      variants={variants}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className="relative flex max-w-[90%] sm:max-w-[80%] md:max-w-[75%]">
        {/* Accent bar (AI on left, User on right) */}
        {!isUser && <AccentBar />}

        {/* Message + timestamp wrapper */}
        <div className="flex flex-col flex-1">
          {/* Message card */}
          <div className={`rounded-r-md rounded-t-md p-2 ${bubbleBg}`}>
            <p className="text-xs sm:text-sm md:text-base leading-relaxed whitespace-pre-wrap break-words max-w-full overflow-hidden text-ellipsis">{content}</p>
          </div>

          {/* Timestamp */}
          <span className={`mt-0.5 text-xs text-zinc-400 select-none ${isUser ? 'text-right' : 'text-left'}`}>
            {formatTimestamp(timestamp)}
          </span>
        </div>

        {/* Accent bar on right for user */}
        {isUser && <AccentBar />}
      </div>
    </motion.div>
  );
} 