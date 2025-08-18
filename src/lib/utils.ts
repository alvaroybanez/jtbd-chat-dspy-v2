import { clsx } from 'clsx'

export function cn(...inputs: (string | undefined | null | boolean)[]) {
  return clsx(inputs)
}