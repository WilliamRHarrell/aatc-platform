import { describe, it, expect } from 'vitest'
import { sanitizeFolderName, uniqueFolderName, csvField, csvRow } from './wall-of-honor-print'

describe('sanitizeFolderName', () => {
  it('strips reserved characters and collapses whitespace', () => {
    expect(sanitizeFolderName('John  "Jack" /Smith\\ Jr.: <1>|*?')).toBe('John Jack Smith Jr. 1')
  })
  it('strips control characters and trims dots and spaces', () => {
    expect(sanitizeFolderName('  ..Ann\u0000\n Lee (2025).. ')).toBe('Ann Lee (2025)')
  })
  it('falls back when nothing is left', () => {
    expect(sanitizeFolderName('...')).toBe('honoree')
  })
})

describe('uniqueFolderName', () => {
  it('suffixes collisions, case-insensitively', () => {
    const used = new Set<string>()
    expect(uniqueFolderName('A B (2025)', used)).toBe('A B (2025)')
    expect(uniqueFolderName('a b (2025)', used)).toBe('a b (2025) 2')
    expect(uniqueFolderName('A B (2025)', used)).toBe('A B (2025) 3')
  })
})

describe('csv', () => {
  it('quotes commas, quotes and newlines; doubles quotes', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('x\ny')).toBe('"x\ny"')
    expect(csvField('x\ry')).toBe('"x\ry"')
    expect(csvField('x\r\ny')).toBe('"x\r\ny"')
    expect(csvField('plain')).toBe('plain')
  })
  it('renders null and booleans', () => {
    expect(csvRow(['a', null, 2, true])).toBe('a,,2,true')
  })
})
