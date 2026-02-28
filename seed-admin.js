/**
 * seed-admin.js
 * Run once to create the first admin user:
 *   node seed-admin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const ADMIN = {
  username: 'admin',
  email: 'admin@bloghub.com',
  password: 'admin123',
  role: 'admin',
  bio: 'Site Administrator'
};

async function seed() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/blogapp');
  console.log('Connected to MongoDB');

  const exists = await User.findOne({ email: ADMIN.email });
  if (exists) {
    if (exists.role !== 'admin') {
      exists.role = 'admin';
      await exists.save();
      console.log(`✅ User "${exists.username}" promoted to admin.`);
    } else {
      console.log(`ℹ️  Admin "${exists.username}" already exists.`);
    }
  } else {
    const user = new User(ADMIN);
    await user.save();
    console.log(`✅ Admin created!`);
    console.log(`   Email   : ${ADMIN.email}`);
    console.log(`   Password: ${ADMIN.password}`);
  }

  console.log('\n👉 Login at http://localhost:3000/auth/login');
  console.log('👉 Admin panel at http://localhost:3000/admin');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
