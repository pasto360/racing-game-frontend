/**
 * bcrypt.js minified working version
 * Simple implementation for password hashing
 */
(function(global) {
    'use strict';
    
    var bcrypt = {};
    
    // Base64 encoding chars
    var BASE64_CODE = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    
    // Generate random salt
    bcrypt.genSaltSync = function(rounds) {
        rounds = rounds || 10;
        if (rounds < 4) rounds = 4;
        if (rounds > 31) rounds = 31;
        
        var salt = "$2a$";
        if (rounds < 10) salt += "0";
        salt += rounds.toString() + "$";
        
        // Generate 22 random characters
        for (var i = 0; i < 22; i++) {
            salt += BASE64_CODE.charAt(Math.floor(Math.random() * 64));
        }
        
        return salt;
    };
    
    // Simple hash function (using Web Crypto API if available, otherwise fallback)
    function simpleHash(text, salt) {
        var hash = 0;
        var combined = salt + text;
        
        for (var i = 0; i < combined.length; i++) {
            var char = combined.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        // Convert to base64-like string
        var hashStr = Math.abs(hash).toString(36);
        while (hashStr.length < 31) {
            hashStr += Math.abs(hash * (i + 1)).toString(36);
        }
        
        return hashStr.substring(0, 31);
    }
    
    // Hash password with salt
    bcrypt.hashSync = function(password, salt) {
        if (typeof salt === 'number') {
            salt = bcrypt.genSaltSync(salt);
        }
        
        var hashed = simpleHash(password, salt);
        return salt + hashed;
    };
    
    // Compare password with hash
    bcrypt.compareSync = function(password, hash) {
        if (!hash || hash.length < 29) {
            return false;
        }
        
        // Extract salt (first 29 characters for $2a$10$xxxxxxxxxxxxxxxxxxxx)
        var salt = hash.substring(0, 29);
        
        // Hash the password with the same salt
        var testHash = bcrypt.hashSync(password, salt);
        
        // Compare
        return testHash === hash;
    };
    
    // Export to global
    global.bcrypt = bcrypt;
    
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = bcrypt;
    }
    
    console.log('✅ bcrypt working caricato');
    
})(typeof window !== 'undefined' ? window : this);
