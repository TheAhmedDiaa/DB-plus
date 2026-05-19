const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../db');

// GET /api/customers — list all customers
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT c.Id, c.First_Name, c.Last_Name, c.Date_of_Birth,
             ca.Address,
             cp.Phone
      FROM Customer c
      LEFT JOIN Customer_Address ca ON c.Id = ca.Customer_Id
      LEFT JOIN Customer_Phones cp  ON c.Id = cp.Customer_Id
    `);
    const grouped = {};
    result.recordset.forEach(row => {
      if (!grouped[row.Id]) {
        grouped[row.Id] = {
          Id: row.Id,
          First_Name: row.First_Name,
          Last_Name: row.Last_Name,
          Date_of_Birth: row.Date_of_Birth,
          Addresses: [],
          Phones: []
        };
      }
      if (row.Address && !grouped[row.Id].Addresses.includes(row.Address))
        grouped[row.Id].Addresses.push(row.Address);
      if (row.Phone && !grouped[row.Id].Phones.includes(row.Phone))
        grouped[row.Id].Phones.push(row.Phone);
    });
    res.json(Object.values(grouped));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers — create a new customer
router.post('/', async (req, res) => {
  const { first_name, last_name, date_of_birth, phone, address } = req.body;
  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'First name and last name are required.' });
  }
  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await new sql.Request(transaction)
        .input('fn', sql.NVarChar, first_name)
        .input('ln', sql.NVarChar, last_name)
        .input('dob', sql.Date, date_of_birth || null)
        .query('INSERT INTO Customer (First_Name, Last_Name, Date_of_Birth) OUTPUT INSERTED.Id VALUES (@fn, @ln, @dob)');
      const newId = result.recordset[0].Id;

      if (phone) {
        await new sql.Request(transaction)
          .input('cid', sql.Int, newId)
          .input('phone', sql.NVarChar, phone)
          .query('INSERT INTO Customer_Phones (Customer_Id, Phone) VALUES (@cid, @phone)');
      }
      if (address) {
        await new sql.Request(transaction)
          .input('cid', sql.Int, newId)
          .input('addr', sql.NVarChar, address)
          .query('INSERT INTO Customer_Address (Customer_Id, Address) VALUES (@cid, @addr)');
      }
      await transaction.commit();
      res.json({ success: true, message: 'Customer created!', id: newId });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
