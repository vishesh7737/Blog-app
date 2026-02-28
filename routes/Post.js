const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');
const { isLoggedIn, isAdmin } = require('../middleware/auth');

// ─── AUTH ROUTES ─────────────────────────────────────────────────────────────

// Register
router.post('/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: 'All fields are required' });

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(400).json({ error: 'Username or email already taken' });

    const user = new User({ username, email, password });
    await user.save();

    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.role = user.role;
    res.json({ success: true, user: { id: user._id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid email or password' });

    const match = await user.comparePassword(password);
    if (!match) return res.status(400).json({ error: 'Invalid email or password' });

    if (user.banned) return res.status(403).json({ error: 'Your account has been banned. Reason: ' + (user.banReason || 'Violation of terms.') });

    user.lastLogin = new Date();
    await user.save();

    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.role = user.role;
    res.json({ success: true, user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout
router.post('/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get current user
router.get('/auth/me', (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true, userId: req.session.userId, username: req.session.username, role: req.session.role || 'user' });
  } else {
    res.json({ loggedIn: false });
  }
});

// ─── POST ROUTES ─────────────────────────────────────────────────────────────

// Get all posts (with pagination, search, filter)
router.get('/posts', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const author = req.query.author || '';

    const query = { published: true };
    if (search) query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { content: { $regex: search, $options: 'i' } },
      { tags: { $regex: search, $options: 'i' } }
    ];
    if (category) query.category = category;
    if (author) query.author = author;

    const total = await Post.countDocuments(query);
    const posts = await Post.find(query)
      .populate('author', 'username avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-content');

    res.json({ posts, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single post by slug
router.get('/posts/:slug', async (req, res) => {
  try {
    const post = await Post.findOneAndUpdate(
      { slug: req.params.slug, published: true },
      { $inc: { views: 1 } },
      { new: true }
    ).populate('author', 'username avatar bio').populate('comments.author', 'username avatar');

    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create post
router.post('/posts', isLoggedIn, async (req, res) => {
  try {
    const { title, content, category, tags, coverImage, published } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content are required' });

    const user = await User.findById(req.session.userId);
    const post = new Post({
      title,
      content,
      category: category || 'General',
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      coverImage: coverImage || '',
      published: published !== false,
      author: req.session.userId,
      authorName: user.username,
      excerpt: content.replace(/<[^>]*>/g, '').substring(0, 200)
    });

    await post.save();
    res.status(201).json({ success: true, post });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update post
router.put('/posts/:id', isLoggedIn, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author.toString() !== req.session.userId.toString())
      return res.status(403).json({ error: 'Not authorized' });

    const { title, content, category, tags, coverImage, published } = req.body;
    post.title = title || post.title;
    post.content = content || post.content;
    post.category = category || post.category;
    post.tags = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : post.tags;
    post.coverImage = coverImage !== undefined ? coverImage : post.coverImage;
    post.published = published !== undefined ? published : post.published;
    post.excerpt = (content || post.content).replace(/<[^>]*>/g, '').substring(0, 200);

    await post.save();
    res.json({ success: true, post });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete post
router.delete('/posts/:id', isLoggedIn, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author.toString() !== req.session.userId.toString())
      return res.status(403).json({ error: 'Not authorized' });

    await post.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Like/Unlike post
router.post('/posts/:id/like', isLoggedIn, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const userId = req.session.userId;
    const liked = post.likes.includes(userId);
    if (liked) {
      post.likes.pull(userId);
    } else {
      post.likes.push(userId);
    }
    await post.save();
    res.json({ liked: !liked, likesCount: post.likes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add comment
router.post('/posts/:id/comments', isLoggedIn, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const user = await User.findById(req.session.userId);
    const comment = {
      author: req.session.userId,
      authorName: user.username,
      content: req.body.content
    };
    post.comments.push(comment);
    await post.save();

    const savedComment = post.comments[post.comments.length - 1];
    res.status(201).json({ success: true, comment: savedComment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete comment
router.delete('/posts/:postId/comments/:commentId', isLoggedIn, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.author.toString() !== req.session.userId.toString())
      return res.status(403).json({ error: 'Not authorized' });

    comment.deleteOne();
    await post.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── USER ROUTES ─────────────────────────────────────────────────────────────

// Get user profile by ID
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password').populate('followers', 'username').populate('following', 'username');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const posts = await Post.find({ author: user._id, published: true }).sort({ createdAt: -1 }).select('-content');
    const totalLikes = posts.reduce((sum, p) => sum + (p.likes?.length || 0), 0);
    const totalViews = posts.reduce((sum, p) => sum + (p.views || 0), 0);
    res.json({ user, posts, stats: { totalPosts: posts.length, totalLikes, totalViews } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update profile (bio, avatar, website, social)
router.put('/users/profile', isLoggedIn, async (req, res) => {
  try {
    const { bio, avatar, website, social } = req.body;
    const user = await User.findByIdAndUpdate(
      req.session.userId,
      { bio, avatar, website, social },
      { new: true }
    ).select('-password');
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change password
router.put('/users/change-password', isLoggedIn, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.session.userId);
    const match = await user.comparePassword(currentPassword);
    if (!match) return res.status(400).json({ error: 'Current password is incorrect' });
    user.password = newPassword;
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Follow / Unfollow
router.post('/users/:id/follow', isLoggedIn, async (req, res) => {
  try {
    if (req.params.id === req.session.userId.toString())
      return res.status(400).json({ error: 'You cannot follow yourself' });

    const target = await User.findById(req.params.id);
    const me = await User.findById(req.session.userId);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const already = target.followers.includes(req.session.userId);
    if (already) {
      target.followers.pull(req.session.userId);
      me.following.pull(req.params.id);
    } else {
      target.followers.push(req.session.userId);
      me.following.push(req.params.id);
    }
    await target.save();
    await me.save();
    res.json({ following: !already, followersCount: target.followers.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bookmark / Unbookmark post
router.post('/posts/:id/bookmark', isLoggedIn, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const already = user.bookmarks.includes(req.params.id);
    if (already) user.bookmarks.pull(req.params.id);
    else user.bookmarks.push(req.params.id);
    await user.save();
    res.json({ bookmarked: !already });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get my bookmarks
router.get('/my-bookmarks', isLoggedIn, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).populate({
      path: 'bookmarks',
      select: '-content',
      options: { sort: { createdAt: -1 } }
    });
    res.json(user.bookmarks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get my posts
router.get('/my-posts', isLoggedIn, async (req, res) => {
  try {
    const posts = await Post.find({ author: req.session.userId })
      .sort({ createdAt: -1 }).select('-content');
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get categories with counts
router.get('/categories', async (req, res) => {
  try {
    const cats = await Post.aggregate([
      { $match: { published: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────

// Admin: Site stats
router.get('/admin/stats', isAdmin, async (req, res) => {
  try {
    const [totalUsers, totalPosts, totalComments, bannedUsers, recentUsers, recentPosts, categoryStats] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments(),
      Post.aggregate([{ $project: { count: { $size: '$comments' } } }, { $group: { _id: null, total: { $sum: '$count' } } }]),
      User.countDocuments({ banned: true }),
      User.find().sort({ createdAt: -1 }).limit(5).select('-password'),
      Post.find().sort({ createdAt: -1 }).limit(5).select('-content').populate('author', 'username'),
      Post.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }])
    ]);
    res.json({
      totalUsers,
      totalPosts,
      totalComments: totalComments[0]?.total || 0,
      bannedUsers,
      recentUsers,
      recentPosts,
      categoryStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all users
router.get('/admin/users', isAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const search = req.query.search || '';
    const query = search ? { $or: [{ username: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }] } : {};
    const total = await User.countDocuments(query);
    const users = await User.find(query).select('-password').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    // attach post count
    const userIds = users.map(u => u._id);
    const postCounts = await Post.aggregate([
      { $match: { author: { $in: userIds } } },
      { $group: { _id: '$author', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    postCounts.forEach(p => { countMap[p._id.toString()] = p.count; });
    const result = users.map(u => ({ ...u.toObject(), postCount: countMap[u._id.toString()] || 0 }));
    res.json({ users: result, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all posts
router.get('/admin/posts', isAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const search = req.query.search || '';
    const query = search ? { title: { $regex: search, $options: 'i' } } : {};
    const total = await Post.countDocuments(query);
    const posts = await Post.find(query).select('-content').populate('author', 'username email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    res.json({ posts, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Ban / Unban user
router.put('/admin/users/:id/ban', isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot ban an admin' });
    user.banned = !user.banned;
    user.banReason = req.body.reason || '';
    await user.save();
    res.json({ success: true, banned: user.banned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Promote / Demote user (toggle role)
router.put('/admin/users/:id/role', isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.role = user.role === 'admin' ? 'user' : 'admin';
    await user.save();
    res.json({ success: true, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete user
router.delete('/admin/users/:id', isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete an admin' });
    await Post.deleteMany({ author: user._id });
    await user.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete any post
router.delete('/admin/posts/:id', isAdmin, async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Toggle post published status
router.put('/admin/posts/:id/toggle', isAdmin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.published = !post.published;
    await post.save();
    res.json({ success: true, published: post.published });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
