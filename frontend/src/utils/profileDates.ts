import type { User } from '../types';
import { formatLongDate } from './dateTime';

const MIN_VALID_PROFILE_YEAR = 1900;

export function hasUsableCreatedAt(user: Pick<User, 'created_at'> | null | undefined): boolean {
  if (!user?.created_at) return false;
  const createdAt = new Date(user.created_at);
  return !Number.isNaN(createdAt.getTime()) && createdAt.getUTCFullYear() > MIN_VALID_PROFILE_YEAR;
}

export function formatUserCreatedAt(user: Pick<User, 'created_at'> | null | undefined): string {
  if (!hasUsableCreatedAt(user)) return 'Unknown';
  const createdAt = user?.created_at;
  if (!createdAt) return 'Unknown';
  return formatLongDate(createdAt);
}
