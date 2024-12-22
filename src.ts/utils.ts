export function addHexPrefix(v: string): string {
  if (v.substr(0, 2) === '0x') return v;
  return '0x' + v;
}

export function stripHexPrefix(v: string): string {
  return addHexPrefix(v).substr(2);
}

export function leftPadBytes32(v: string): string {
  const hex = stripHexPrefix(v);
  return addHexPrefix('0'.repeat(0x40 - hex.length) + hex);
}

export function rightPadBytes32(v: string): string {
  const hex = stripHexPrefix(v);
  return addHexPrefix(hex + '0'.repeat(0x40 - hex.length));
}

export function leftPadByte(v: string): string {
  const hex = stripHexPrefix(v);
  if (hex.length % 2 !== 0) return addHexPrefix('0' + hex);
  return addHexPrefix(hex);
}
