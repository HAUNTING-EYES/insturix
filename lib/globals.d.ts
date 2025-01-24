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
