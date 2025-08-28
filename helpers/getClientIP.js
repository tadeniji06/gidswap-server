// Helper function to get real IP address
const getClientIP = (req) => {
    return (
        req.headers['cf-connecting-ip'] ||          
        req.headers['x-real-ip'] ||                 
        req.headers['x-forwarded-for']?.split(',')[0] || 
        req.headers['x-forwarded'] ||              
        req.headers['x-cluster-client-ip'] ||      
        req.headers['forwarded-for'] ||
        req.headers['forwarded'] ||
        req.connection?.remoteAddress ||            
        req.socket?.remoteAddress ||
        (req.connection?.socket ? req.connection.socket.remoteAddress : null) ||
        req.ip ||
        req.ips?.[0] ||
        'unknown'
    );
};

// Helper function to get user agent
const getUserAgent = (req) => {
    return req.headers['user-agent'] || 'unknown';
};

module.exports = { getClientIP, getUserAgent };