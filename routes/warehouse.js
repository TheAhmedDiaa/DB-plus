const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../db');

// GET /api/warehouse — list all warehouses with their products
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT w.Id AS Warehouse_Id, w.Name AS Warehouse_Name, w.Location,
             p.Id AS Product_Id, p.Name AS Product_Name,
             p.Category, p.Quantity
      FROM Warehouse w
      LEFT JOIN Warehouse_Products wp ON w.Id = wp.Warehouse_Id
      LEFT JOIN Products p            ON wp.Product_Id = p.Id
    `);
    // Group by warehouse
    const grouped = {};
    result.recordset.forEach(row => {
      if (!grouped[row.Warehouse_Id]) {
        grouped[row.Warehouse_Id] = {
          Id: row.Warehouse_Id,
          Name: row.Warehouse_Name,
          Location: row.Location,
          Products: []
        };
      }
      if (row.Product_Id) {
        grouped[row.Warehouse_Id].Products.push({
          Id: row.Product_Id,
          Name: row.Product_Name,
          Category: row.Category,
          Quantity: row.Quantity
        });
      }
    });
    res.json(Object.values(grouped));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
