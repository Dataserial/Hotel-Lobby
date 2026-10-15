// รูปแบบพื้นฐานของเว็บไซต์
var express = require('express');
var router = express.Router();

/* แสดงหน้าแรกตัวอย่าง */
// อ่านข้อมูล /
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

module.exports = router;
