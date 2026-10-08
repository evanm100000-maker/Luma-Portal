/**
 * Crypto & Password Encryption Utilities for Luma Oportal
 * Uses Web Crypto API SHA-256 hashing algorithms
 */

const CryptoUtils = {
    /**
     * Compute SHA-256 Hash string for given text
     * @param {string} text 
     * @returns {Promise<string>} Hex string of hash
     */
    async hashPassword(text) {
        if (!text) return '';
        const encoder = new TextEncoder();
        const data = encoder.encode(text.trim());
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    },

    /**
     * Verify plain text against SHA-256 hash
     * @param {string} plainText 
     * @param {string} storedHash 
     * @returns {Promise<boolean>}
     */
    async verifyPassword(plainText, storedHash) {
        if (!plainText || !storedHash) return false;
        const computedHash = await this.hashPassword(plainText);
        return computedHash === storedHash;
    },

    /**
     * Encrypted hash constant for promotion password "Luma2025"
     */
    PROMOTION_PASSWORD_HASH: null,

    /**
     * Initialize preset hash constants
     */
    async init() {
        // Pre-compute hash for promotion password "Luma2025"
        this.PROMOTION_PASSWORD_HASH = await this.hashPassword('Luma2025');
    }
};

// Initialize crypto hashes on script load
CryptoUtils.init();
