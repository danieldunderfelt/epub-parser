export function isNumeric(value: any): boolean {
  if (typeof value === 'number') {
    return !isNaN(value)
  } else if (typeof value === 'string') {
    const numberValue = parseFloat(value)
    return !isNaN(numberValue) && isFinite(numberValue)
  }
  return false
}
