"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.leftPadByte = exports.rightPadBytes32 = exports.leftPadBytes32 = exports.stripHexPrefix = exports.addHexPrefix = void 0;
function addHexPrefix(v) {
    if (v.substr(0, 2) === '0x')
        return v;
    return '0x' + v;
}
exports.addHexPrefix = addHexPrefix;
function stripHexPrefix(v) {
    return addHexPrefix(v).substr(2);
}
exports.stripHexPrefix = stripHexPrefix;
function leftPadBytes32(v) {
    const hex = stripHexPrefix(v);
    return addHexPrefix('0'.repeat(0x40 - hex.length) + hex);
}
exports.leftPadBytes32 = leftPadBytes32;
function rightPadBytes32(v) {
    const hex = stripHexPrefix(v);
    return addHexPrefix(hex + '0'.repeat(0x40 - hex.length));
}
exports.rightPadBytes32 = rightPadBytes32;
function leftPadByte(v) {
    const hex = stripHexPrefix(v);
    if (hex.length % 2 !== 0)
        return addHexPrefix('0' + hex);
    return addHexPrefix(hex);
}
exports.leftPadByte = leftPadByte;
//# sourceMappingURL=utils.js.map