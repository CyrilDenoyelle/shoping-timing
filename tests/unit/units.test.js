import { describe, it, expect } from 'vitest'
import {
  UNITS,
  getUnitGroup,
  getBaseUnit,
  unitScale,
  needsConversionModal,
  convertQuantity,
} from '@/utils/todo/units.js'

describe('units', () => {
  it('exposes expected unit list', () => {
    expect(UNITS).toContain('kg')
    expect(UNITS).toContain('L')
  })

  it('getUnitGroup classifies mass, volume and none', () => {
    expect(getUnitGroup('')).toBe('none')
    expect(getUnitGroup('kg')).toBe('mass')
    expect(getUnitGroup('L')).toBe('volume')
    expect(getUnitGroup('pcs')).toBe('pcs')
  })

  it('getBaseUnit returns gram and milliliter bases', () => {
    expect(getBaseUnit('kg')).toBe('g')
    expect(getBaseUnit('L')).toBe('mL')
    expect(getBaseUnit('pcs')).toBe('pcs')
  })

  it('unitScale returns relative scale within a group', () => {
    expect(unitScale('kg')).toBe(1000)
    expect(unitScale('g')).toBe(1)
    expect(unitScale('L')).toBe(1000)
    expect(unitScale('')).toBe(1)
  })

  it('needsConversionModal when groups differ', () => {
    expect(needsConversionModal('kg', 'g')).toBe(false)
    expect(needsConversionModal('kg', 'L')).toBe(true)
    expect(needsConversionModal('pcs', 'kg')).toBe(true)
    expect(needsConversionModal('L', 'L')).toBe(false)
  })

  it('convertQuantity within same unit group', () => {
    expect(convertQuantity(1, 'kg', 'g')).toBe(1000)
    expect(convertQuantity(500, 'g', 'kg')).toBe(0.5)
    expect(convertQuantity(2, 'L', 'mL')).toBe(2000)
  })

  it('convertQuantity with custom cross-group factor (base units)', () => {
    // 1 L ≈ 1,03 kg → stored as mL:g like setUnit does
    const conversions = { 'mL:g': 1.03 }
    expect(convertQuantity(2, 'L', 'kg', conversions)).toBeCloseTo(2.06)
  })

  it('convertQuantity with reverse cross-group factor', () => {
    const conversions = { 'g:mL': 0.97 }
    expect(convertQuantity(1, 'L', 'kg', conversions)).toBeCloseTo(1 / 0.97)
  })

  it('returns qty unchanged when conversion is unknown', () => {
    expect(convertQuantity(3, 'pcs', 'kg', {})).toBe(3)
  })
})
