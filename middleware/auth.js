const isLoggedIn = (req, res, next) => {
  if (req.session.userId) return next();
  res.status(401).json({ error: 'Please login to continue.' });
};

const isAdmin = (req, res, next) => {
  if (req.session.userId && req.session.role === 'admin') return next();
  res.status(403).json({ error: 'Admin access required.' });
};

module.exports = { isLoggedIn, isAdmin };
