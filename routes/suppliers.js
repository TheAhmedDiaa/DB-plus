const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../db');

// GET /api/suppliers — list all suppliers
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT s.Id, s.First_Name, s.Last_Name, s.Date_of_Birth, s.Email,
             sa.Address,
             sp.Phone
      FROM Supplier s
      LEFT JOIN Supplier_Address sa ON s.Id = sa.Supplier_Id
      LEFT JOIN Supplier_Phones sp  ON s.Id = sp.Supplier_Id
    `);
    const grouped = {};
    result.recordset.forEach(row => {
      if (!grouped[row.Id]) {
        grouped[row.Id] = {
          Id: row.Id,
          First_Name: row.First_Name,
          Last_Name: row.Last_Name,
          Date_of_Birth: row.Date_of_Birth,
          Email: row.Email,
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

// POST /api/suppliers — create a new supplier
router.post('/', async (req, res) => {
  const { first_name, last_name, date_of_birth, email, phone, address } = req.body;
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
        .input('email', sql.NVarChar, email || null)
        .query('INSERT INTO Supplier (First_Name, Last_Name, Date_of_Birth, Email) OUTPUT INSERTED.Id VALUES (@fn, @ln, @dob, @email)');
      const newId = result.recordset[0].Id;

      if (phone) {
        await new sql.Request(transaction)
          .input('sid', sql.Int, newId)
          .input('phone', sql.NVarChar, phone)
          .query('INSERT INTO Supplier_Phones (Supplier_Id, Phone) VALUES (@sid, @phone)');
      }
      if (address) {
        await new sql.Request(transaction)
          .input('sid', sql.Int, newId)
          .input('addr', sql.NVarChar, address)
          .query('INSERT INTO Supplier_Address (Supplier_Id, Address) VALUES (@sid, @addr)');
      }
      await transaction.commit();
      res.json({ success: true, message: 'Supplier created!', id: newId });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
