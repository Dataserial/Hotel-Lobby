// เส้นทางตัวอย่างสำหรับรายการผู้ใช้
var express = require('express');
var router = express.Router();

/* แสดงรายการผู้ใช้ตัวอย่าง */
// อ่านข้อมูล /
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

module.exports = router;
