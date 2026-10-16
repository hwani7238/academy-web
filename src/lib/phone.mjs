/** @param {unknown} phone @returns {string | null} */
export function phoneLast4(phone) {
    if (typeof phone !== 'string') return null;
    const digits = phone.replace(/[^0-9]/g, '');
    return digits.length >= 4 ? digits.slice(-4) : null;
}
