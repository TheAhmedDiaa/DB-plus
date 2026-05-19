const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../db');

// GET /api/status — list all order statuses
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT Id, Status FROM Status');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
