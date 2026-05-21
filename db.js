const sql = require('mssql/msnodesqlv8');

const config = {
  connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=.;Database=InventoryDB;Trusted_Connection=Yes;',
  driver: 'msnodesqlv8',
  options: {
    trustServerCertificate: true,
    encrypt: false,
  }
};

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect()
      .then(pool => {
        console.log('Connected to SQL Server');
        return pool;
      })
      .catch(err => {
        poolPromise = null;
        console.error('DB Connection failed:', err.message);
        throw err;
      });
  }
  return poolPromise;
}

module.exports = { sql, getPool };
