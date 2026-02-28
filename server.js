require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');

const app = express();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/blogapp')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ MongoDB Error:', err));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret123',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

app.use(flash());

// Global middleware - pass user and flash to all views
app.use((req, res, next) => {
  res.locals.currentUser = req.session.userId || null;
  res.locals.currentUsername = req.session.username || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

// Set view engine to use plain HTML (we'll serve HTML directly)
app.set('view engine', 'html');

// Routes
const authRoutes = require('./routes/auth');
const blogRoutes = require('./routes/blog');
const apiRoutes = require('./routes/api');

app.use('/auth', authRoutes);
app.use('/blog', blogRoutes);
app.use('/api', apiRoutes);

// Profile page
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'views', 'profile.html')));
app.get('/profile/:id', (req, res) => res.sendFile(path.join(__dirname, 'views', 'profile.html')));

// Admin panel
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));
app.get('/admin/:section', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
