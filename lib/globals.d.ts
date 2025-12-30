export {};

// Create a type for the roles
export type Roles =
  | "free"
  | "pro"
  | "premium"
  | "basic"
  | "enterprise"
  | "creators";

declare global {
  interface CustomJwtSessionClaims {
    metadata: {
      role?: Roles;
    };
  }
}

// CSS Module declarations to suppress TypeScript warnings
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

declare module './globals.css' {
  const content: Record<string, string>;
  export default content;
}
