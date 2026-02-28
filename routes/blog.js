const express = require('express');
const router = express.Router();
const path = require('path');

router.get('/', (req, res) => res.sendFile(path.join(__dirname, '../views/index.html')));
router.get('/new', (req, res) => res.sendFile(path.join(__dirname, '../views/editor.html')));
router.get('/edit/:id', (req, res) => res.sendFile(path.join(__dirname, '../views/editor.html')));
router.get('/:slug', (req, res) => res.sendFile(path.join(__dirname, '../views/post.html')));

module.exports = router;
