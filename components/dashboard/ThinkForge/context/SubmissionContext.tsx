import { createContext } from "react";

interface SubmissionContextType {
  submitted: boolean;
  setSubmitted: (value: boolean) => void;
  prompt: string;
  setPrompt: (value: string) => void;
  agentResponse: string;
  setAgentResponse: (value: string) => void;  
  loading: boolean;
  setLoading: (value: boolean) => void;
  error: string | null;
  setError: (value: string | null) => void;
}

export const SubmissionContext = createContext<SubmissionContextType>({
  submitted: false,
  setSubmitted: () => {},
  prompt: "",
  setPrompt: () => {},
  agentResponse: "",
  setAgentResponse: () => {},
  loading: false,
  setLoading: () => {},
  error: null,
  setError: () => {},
});