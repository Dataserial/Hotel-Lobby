// API ภาพรวมโรงแรมและรายงานผู้ดูแล
const express = require('express');
const { role } = require('../lib/auth');
const { asyncRoute, fail } = require('../lib/http');
const { dashboard, report } = require('../services/dashboard-service');
module.exports = (db) => {
  const router = express.Router();
  // กำหนดเงื่อนไขร่วมของเส้นทาง
  router.use(role('admin', 'receptionist'));
  // กำหนดเงื่อนไขร่วมของเส้นทาง
  router.use((req, _res, next) => {
    if (Object.keys(req.query).length) fail(400, 'VALIDATION_ERROR', 'Unexpected query field');
    next();
  });
  // อ่านข้อมูล /
  router.get('/', asyncRoute(async (_req, res) => res.json(await dashboard(db))));
  // อ่านข้อมูล /report
  router.get('/report', role('admin'), asyncRoute(async (_req, res) => res.json(await report(db))));
  return router;
};
