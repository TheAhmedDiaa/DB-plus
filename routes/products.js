const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../db');

// GET /api/products — list all products
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT Id, Name, Date_of_Manufacture, Date_of_Expiration, Price, Category, Quantity
      FROM Products
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT * FROM Products WHERE Id = @id');
    if (result.recordset.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
