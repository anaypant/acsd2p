// Centralized resource naming utility
export function getResourceName(stage: string, name: string): string {
  return `${stage}-${name}`;
} 