import { ThinkingHat } from '../types';

export const getToneLabel = (tone: ThinkingHat): string => {
  switch (tone) {
    case 'white': return 'Analytical';
    case 'red': return 'Emotional';
    case 'black': return 'Critical';
    case 'yellow': return 'Optimistic';
    case 'green': return 'Creative';
    case 'blue': return 'Strategic';
    default: return 'Balanced';
  }
};

export const getToneDescription = (tone: ThinkingHat): string => {
  switch (tone) {
    case 'white': return 'Facts, data, and objective information';
    case 'red': return 'Emotions, feelings, and intuition';
    case 'black': return 'Caution, risk, and critical judgment';
    case 'yellow': return 'Optimism, benefits, and positive outcomes';
    case 'green': return 'Creativity, new ideas, and possibilities';
    case 'blue': return 'Process, organization, and big-picture thinking';
    default: return 'Balanced perspective';
  }
};

export const getToneBadgeColor = (tone: ThinkingHat): string => {
  switch (tone) {
    case 'white': return 'bg-gray-100 text-gray-900 border-gray-200';
    case 'red': return 'bg-gold text-white border-gold';
    case 'black': return 'bg-gray-800 text-gray-100 border-gray-700';
    case 'yellow': return 'bg-yellow-400 text-yellow-900 border-yellow-400';
    case 'green': return 'bg-green-500 text-white border-green-500';
    case 'blue': return 'bg-blue-500 text-white border-blue-500';
    default: return 'bg-zinc-600 text-white border-zinc-600';
  }
};

export const getToneTextColor = (tone: ThinkingHat): string => {
  switch (tone) {
    case 'white': return 'text-white';
    case 'red': return 'text-gold';
    case 'black': return 'text-black';
    case 'yellow': return 'text-yellow-400';
    case 'green': return 'text-green-500';
    case 'blue': return 'text-blue-500';
    default: return 'text-zinc-400';
  }
};

export const getToneIcon = (tone: ThinkingHat): string => {
  switch (tone) {
    case 'white': return '📊';
    case 'red': return '❤️';
    case 'black': return '⚫';
    case 'yellow': return '💡';
    case 'green': return '🌱';
    case 'blue': return '🎯';
    default: return '⚖️';
  }
}; 