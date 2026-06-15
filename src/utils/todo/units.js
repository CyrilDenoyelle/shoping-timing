const UNIT_GROUPS = {
  mass:   { kg: 1000, g: 1 },
  volume: { L: 1000, cL: 10, mL: 1 },
}

export const UNITS = ['', 'pcs', 'kg', 'g', 'L', 'cL', 'mL']

export function getUnitGroup(unit) {
  if (unit === '') return 'none'
  for (const [name, group] of Object.entries(UNIT_GROUPS)) {
    if (group[unit] != null) return name
  }
  return unit
}

export function getBaseUnit(unit) {
  for (const group of Object.values(UNIT_GROUPS)) {
    if (group[unit] != null) {
      return Object.entries(group).find(([, v]) => v === 1)?.[0] ?? unit
    }
  }
  return unit
}

export function unitScale(unit) {
  for (const group of Object.values(UNIT_GROUPS)) {
    if (group[unit] != null) return group[unit]
  }
  return 1
}

export function needsConversionModal(fromUnit, toUnit) {
  if (fromUnit === toUnit) return false
  return getUnitGroup(fromUnit) !== getUnitGroup(toUnit)
}

export function convertQuantity(qty, fromUnit, toUnit, conversions = {}) {
  if (fromUnit === toUnit) return qty
  for (const group of Object.values(UNIT_GROUPS)) {
    if (group[fromUnit] != null && group[toUnit] != null) {
      return qty * group[fromUnit] / group[toUnit]
    }
  }
  const fromBase = getBaseUnit(fromUnit)
  const toBase = getBaseUnit(toUnit)
  const key = `${fromBase}:${toBase}`
  const reverseKey = `${toBase}:${fromBase}`
  if (conversions[key] != null) {
    const qtyInFromBase = convertQuantity(qty, fromUnit, fromBase)
    return convertQuantity(qtyInFromBase * conversions[key], toBase, toUnit)
  }
  if (conversions[reverseKey] != null) {
    const qtyInFromBase = convertQuantity(qty, fromUnit, fromBase)
    return convertQuantity(qtyInFromBase / conversions[reverseKey], toBase, toUnit)
  }
  return qty
}
