import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(cents / 100)
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(dateString))
}

export function sortBoothsNumerically<T extends { booth_number: string }>(
  booths: T[]
): T[] {
  return [...booths].sort((a, b) => {
    const aNum = parseInt(a.booth_number.replace(/\D/g, ''), 10)
    const bNum = parseInt(b.booth_number.replace(/\D/g, ''), 10)
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum
    return a.booth_number.localeCompare(b.booth_number)
  })
}
